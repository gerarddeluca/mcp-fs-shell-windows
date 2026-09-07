import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { validatePathPreservingLinks, stripLongPath, stripLongPathAll } from "../helpers/path.js";

const execFileAsync = promisify(execFile);

// Best-effort unlink that retries after clearing read-only flags, so plain
// directory trees delete as completely as fs.rm(..., { force: true }) did.
async function unlinkEntry(fullPath: string): Promise<void> {
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    try {
      await fs.chmod(fullPath, 0o666);
      await fs.unlink(fullPath);
    } catch {
      throw error;
    }
  }
}

// Recursively delete a real directory without following reparse points
// (junctions/symlinks): every entry is classified with lstat, links are
// removed as leaves, real directories are walked, files are unlinked.
async function rmRealDirectory(dir: string, errors: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    try {
      const st = await fs.lstat(fullPath);
      if (st.isSymbolicLink()) {
        await fs.unlink(fullPath);
      } else if (st.isDirectory()) {
        // The recursive call removes the directory itself
        await rmRealDirectory(fullPath, errors);
      } else {
        await unlinkEntry(fullPath);
      }
    } catch (error) {
      errors.push(
        stripLongPath(fullPath) +
          ": " +
          stripLongPathAll(error instanceof Error ? error.message : String(error))
      );
    }
  }
  try {
    await fs.rmdir(dir);
  } catch (error) {
    errors.push(
      stripLongPath(dir) + ": " + stripLongPathAll(error instanceof Error ? error.message : String(error))
    );
  }
}

// --- Recycle Bin (Windows) -------------------------------------------------
//
// toRecycleBin mode sends files/directories to the Recycle Bin in ONE
// batched PowerShell call (no per-path process spawns). The path list is
// written to a temp file under %TEMP%\mcp-fs-shell-windows\ (UTF-8, one
// path per line), then an -EncodedCommand (UTF-16LE base64) is run that
// calls the VisualBasic FileIO SendToRecycleBin APIs. One tab-separated
// line is emitted per path:
//   OK<TAB><path> | MISSING<TAB><path> | ERR<TAB><path><TAB><message>
// (tabs instead of spaces/colons: paths may legally contain spaces and
// ':' but never TAB). FAIL-SAFE: an ERR or MISSING path is reported as an
// error and is NEVER permanently deleted as a fallback.

interface RecycleItem {
  requested: string; // user-facing path (as passed to the tool)
  resolved: string;  // plain-form path sent to the PowerShell batch
  kind: "file" | "directory";
}

interface RecycleOutcome {
  ok: RecycleItem[];
  missing: RecycleItem[];
  err: { item: RecycleItem; message: string }[];
}

async function recycleBatch(items: RecycleItem[]): Promise<RecycleOutcome> {
  const jobDir = path.join(os.tmpdir(), "mcp-fs-shell-windows");
  await fs.mkdir(jobDir, { recursive: true });
  const listFile = path.join(
    jobDir,
    `delete_files_recycle_${Date.now()}_${process.pid}_${Math.floor(Math.random() * 1e9).toString(36)}.txt`
  );
  await fs.writeFile(listFile, items.map((i) => i.resolved).join("\n"), "utf8");
  try {
    const ps = [
      "$ErrorActionPreference='Stop'",
      `$items = Get-Content -LiteralPath '${listFile}' -Encoding UTF8`,
      "Add-Type -AssemblyName Microsoft.VisualBasic",
      "$fileio = [Microsoft.VisualBasic.FileIO.FileSystem]",
      "foreach ($p in $items) {",
      "  try {",
      "    if (Test-Path -LiteralPath $p -PathType Container) {",
      "      $fileio::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
      "      Write-Output ('OK' + [char]9 + $p)",
      "    } elseif (Test-Path -LiteralPath $p -PathType Leaf) {",
      "      $fileio::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
      "      Write-Output ('OK' + [char]9 + $p)",
      "    } else {",
      "      Write-Output ('MISSING' + [char]9 + $p)",
      "    }",
      "  } catch {",
      "    Write-Output ('ERR' + [char]9 + $p + [char]9 + $_.Exception.Message)",
      "  }",
      "}",
    ].join("\n");
    const encoded = Buffer.from(ps, "utf16le").toString("base64");
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: 300000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    );

    const byResolved = new Map<string, RecycleItem>(items.map((i) => [i.resolved, i]));
    const ok: RecycleItem[] = [];
    const missing: RecycleItem[] = [];
    const err: { item: RecycleItem; message: string }[] = [];
    const reported = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const [status, resolved, ...msgParts] = parts;
      const item = byResolved.get(resolved);
      if (!item || reported.has(item.resolved)) continue;
      reported.add(item.resolved);
      if (status === "OK") {
        ok.push(item);
      } else if (status === "MISSING") {
        missing.push(item);
      } else if (status === "ERR") {
        err.push({ item, message: msgParts.join("\t") });
      }
    }
    // A path with no result line at all is an error - never assume success.
    for (const item of items) {
      if (!reported.has(item.resolved)) {
        err.push({ item, message: "no result from recycle batch" });
      }
    }
    return { ok, missing, err };
  } finally {
    await fs.rm(listFile, { force: true }).catch(() => undefined);
  }
}

// Volume roots (drive letters like C:\ or UNC share roots like \\server\share)
// cannot be sent to the Recycle Bin as a unit; reject them so the shell never
// starts moving a whole volume's contents.
function isVolumeRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p) || /^[\\/][^\\/]+[\\/][^\\/]+$/.test(p) || p === "/";
}

export async function handleDeleteFiles(
  paths: string[],
  recursive: boolean,
  allowedDirectories: string[],
  toRecycleBin: boolean
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];
  const linkResults: string[] = [];
  const recycleItems: RecycleItem[] = [];

  const isWin32 = process.platform === "win32";
  const useRecycle = toRecycleBin && isWin32;

  if (toRecycleBin && !isWin32) {
    // Non-Windows: nothing is deleted, each path is reported as an error.
    for (const filePath of paths) {
      errors.push(`Failed to delete ${filePath}: toRecycleBin is supported only on Windows`);
    }
  }

  await Promise.all(
    paths.map(async (filePath) => {
      if (toRecycleBin && !isWin32) return; // already reported above
      try {
        // Validate path is within allowed directories without following
        // reparse points (the link itself must be what gets classified)
        const validPath = await validatePathPreservingLinks(filePath, allowedDirectories);

        // Classify with lstat so reparse points are never followed
        const stats = await fs.lstat(validPath);

        if (stats.isSymbolicLink()) {
          // Junction/symlink: always removed as a leaf, with or without the
          // recursive flag. The link target is never touched.
          await fs.unlink(validPath);
          if (useRecycle) {
            results.push(
              `Successfully deleted link: ${filePath} (link removed permanently; the recycle bin cannot hold links)`
            );
          } else {
            results.push(`Successfully deleted link: ${filePath} (link removed; target untouched)`);
          }
          linkResults.push(filePath);
        } else if (stats.isDirectory()) {
          if (!recursive) {
            throw new Error("Cannot delete directory without recursive flag");
          }
          if (useRecycle) {
            const plain = stripLongPath(validPath);
            if (isVolumeRoot(plain)) {
              throw new Error("Cannot send a volume root to the Recycle Bin");
            }
            recycleItems.push({ requested: filePath, resolved: plain, kind: "directory" });
          } else {
            const dirErrors: string[] = [];
            await rmRealDirectory(validPath, dirErrors);
            if (dirErrors.length > 0) {
              throw new Error(dirErrors.join("; "));
            }
            results.push(`Successfully deleted directory: ${filePath}`);
          }
        } else {
          if (useRecycle) {
            recycleItems.push({ requested: filePath, resolved: stripLongPath(validPath), kind: "file" });
          } else {
            // Delete the file
            await unlinkEntry(validPath);
            results.push(`Successfully deleted file: ${filePath}`);
          }
        }
      } catch (error) {
        const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
        errors.push(`Failed to delete ${filePath}: ${errorMessage}`);
      }
    })
  );

  if (useRecycle && recycleItems.length > 0) {
    const { ok, missing, err } = await recycleBatch(recycleItems);
    for (const item of ok) {
      const noun = item.kind === "directory" ? "directory" : "file";
      results.push(`Successfully deleted ${noun}: ${item.requested} (recycled)`);
    }
    for (const item of missing) {
      errors.push(
        `Failed to delete ${item.requested}: path no longer exists (recycle bin operation not performed)`
      );
    }
    for (const { item, message } of err) {
      errors.push(`Failed to delete ${item.requested}: ${stripLongPathAll(message)}`);
    }
  }

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;

  let output = `Processed ${successCount + errorCount} paths:\n`;
  if (useRecycle && results.length > 0) {
    // Recycle mode: print the per-item success lines so the (recycled) /
    // link-note suffixes are visible. Default mode keeps the historical
    // count-only output (byte-identical when the flag is omitted).
    output += results.join("\n") + "\n";
  }
  output += `- ${successCount} items deleted successfully\n`;
  if (linkResults.length > 0) {
    const linkNote = useRecycle
      ? "link removed permanently; the recycle bin cannot hold links"
      : "link removed; target untouched";
    output += `- ${linkResults.length} reparse point(s) removed (${linkNote}): ${linkResults.join(", ")}\n`;
  }

  if (errorCount > 0) {
    output += `- ${errorCount} items failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  return output;
}
