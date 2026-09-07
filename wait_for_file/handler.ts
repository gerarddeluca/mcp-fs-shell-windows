import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import { validatePath, stripLongPath } from "../helpers/path.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Recursively scan a directory tree and collect the files whose path relative
// to `root` matches `pattern` (minimatch, dot:true - same machinery as search_glob).
// Unreadable directories and entries that vanish mid-scan are skipped.
// Only files are matched; directories are searched through.
async function scanForMatches(root: string, pattern: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // skip directories we can't read
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue; // skip symlinks/devices/etc. - only real files are matched
        }
        // Normalize separators to '/' so minimatch matching is platform-consistent.
        const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
        if (minimatch(relativePath, pattern, { dot: true })) {
          results.push(stripLongPath(fullPath));
        }
      } catch {
        // Skip anything that errors (e.g. raced with a deletion)
        continue;
      }
    }
  }

  await walk(root);
  results.sort();
  return results;
}

export async function handleWaitForFile(
  baseDir: string,
  glob: string,
  timeoutMs: number,
  intervalMs: number,
  allowedDirectories: string[]
): Promise<string> {
  const validRoot = await validatePath(baseDir, allowedDirectories);

  let stats;
  try {
    stats = await fs.stat(validRoot);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Base directory does not exist: ${baseDir}`);
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${baseDir}`);
  }

  // On Windows, treat backslashes in the pattern as path separators so both
  // 'a/b/*.txt' and 'a\b\*.txt' work (minimatch otherwise parses '\\' as an escape).
  const pattern = process.platform === "win32" ? glob.split("\\").join("/") : glob;

  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  let matched: string[] = [];
  for (;;) {
    matched = await scanForMatches(validRoot, pattern);
    if (matched.length > 0) {
      return JSON.stringify({
        matched,
        count: matched.length,
        waitedMs: Date.now() - startedAt,
        timedOut: false,
      });
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    // Async sleep keeps the server event loop responsive between polls.
    await sleep(Math.min(intervalMs, remaining));
  }

  return JSON.stringify({
    matched,
    count: matched.length,
    waitedMs: Date.now() - startedAt,
    timedOut: true,
  });
}
