import fs from "fs/promises";
import { createReadStream } from "fs";
import { createHash } from "crypto";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { minimatch } from "minimatch";
import { createUnifiedDiff } from "../helpers/diff.js";

const TEXT_SIZE_LIMIT = 1024 * 1024; // 1 MiB
const NUL_SCAN_LIMIT = 8192; // 8 KiB

interface FileEntry {
  abs: string;
  size: number;
}

interface ChangedEntry {
  path: string;
  sizeA: number;
  sizeB: number;
  shaA: string;
  shaB: string;
  diff?: string;
}

// Same minimatch machinery/options as list_directory's ignore param, but
// matched against the file's relative path (forward slashes).
function isIgnored(relPath: string, ignore: string[]): boolean {
  if (ignore.length === 0) return false;
  return ignore.some((pattern) => minimatch(relPath, pattern, { dot: true }));
}

async function walkTree(
  root: string,
  ignore: string[]
): Promise<Map<string, FileEntry>> {
  const files = new Map<string, FileEntry>();
  async function visit(abs: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      throw error;
    }
    // Deterministic traversal order
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (isIgnored(relPath, ignore)) continue;
      const absPath = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        await visit(absPath, relPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(absPath);
        files.set(relPath, { abs: absPath, size: stats.size });
      }
    }
  }
  await visit(root, "");
  return files;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function looksLikeText(filePath: string, size: number): Promise<boolean> {
  if (size > TEXT_SIZE_LIMIT) return false;
  if (size === 0) return true;
  const scanLength = Math.min(size, NUL_SCAN_LIMIT);
  const buffer = Buffer.alloc(scanLength);
  const handle = await fs.open(filePath, "r");
  try {
    await handle.read(buffer, 0, scanLength, 0);
  } finally {
    await handle.close();
  }
  return buffer.indexOf(0) === -1;
}

export async function handleDirDiff(
  dirA: string,
  dirB: string,
  ignore: string[],
  maxFiles: number | undefined,
  allowedDirectories: string[]
): Promise<string> {
  const validA = await validatePath(dirA, allowedDirectories);
  const validB = await validatePath(dirB, allowedDirectories);

  for (const [original, valid] of [
    [dirA, validA],
    [dirB, validB],
  ] as const) {
    let stats;
    try {
      stats = await fs.stat(valid);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error(`Directory does not exist: ${original}`);
      }
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${original}`);
    }
  }

  const filesA = await walkTree(validA, ignore);
  const filesB = await walkTree(validB, ignore);

  const union = Array.from(new Set([...filesA.keys(), ...filesB.keys()])).sort();
  let truncated = false;
  let comparePaths = union;
  if (maxFiles !== undefined && union.length > maxFiles) {
    comparePaths = union.slice(0, maxFiles);
    truncated = true;
  }

  const added: { path: string; size: number }[] = [];
  const removed: { path: string; size: number }[] = [];
  const changed: ChangedEntry[] = [];
  let identical = 0;

  for (const relPath of comparePaths) {
    const a = filesA.get(relPath);
    const b = filesB.get(relPath);
    if (!a || !b) {
      if (a && !b) {
        removed.push({ path: relPath, size: a.size });
      } else if (b && !a) {
        added.push({ path: relPath, size: b.size });
      }
      continue;
    }
    // Present in both: decide by size first, then sha256.
    const sizeA = a.size;
    const sizeB = b.size;
    const shaA = await sha256File(a.abs);
    const shaB = await sha256File(b.abs);
    if (sizeA === sizeB && shaA === shaB) {
      identical++;
      continue;
    }
    const entry: ChangedEntry = { path: relPath, sizeA, sizeB, shaA, shaB };
    // Attach a unified diff when BOTH sides look like text.
    if (
      sizeA <= TEXT_SIZE_LIMIT &&
      sizeB <= TEXT_SIZE_LIMIT &&
      (await looksLikeText(a.abs, sizeA)) &&
      (await looksLikeText(b.abs, sizeB))
    ) {
      const textA = await fs.readFile(a.abs, "utf8");
      const textB = await fs.readFile(b.abs, "utf8");
      entry.diff = createUnifiedDiff(textA, textB, relPath, relPath);
    }
    changed.push(entry);
  }

  return JSON.stringify(
    {
      added,
      removed,
      changed,
      counts: {
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        identical,
        compared: comparePaths.length,
      },
      truncated,
    },
    null,
    2
  );
}
