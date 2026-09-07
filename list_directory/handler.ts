import fs from "fs/promises";
import path from "path";
import { validatePath, stripLongPath } from "../helpers/path.js";
import { minimatch } from "minimatch";

export async function handleListDirectory(
  directoryPath: string,
  allowedDirectories: string[],
  type: "files" | "directories" | "all" = "all",
  ignore: string[] = [],
  offset: number = 1,
  limit: number = 100,
  includeSizes: boolean = true
): Promise<string> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const entries = await fs.readdir(validPath, { withFileTypes: true });

  let filtered = entries.filter((entry) => {
    if (entry.isSymbolicLink()) {
      // Links (junctions/symlinks) are only listed with type "all"
      if (type !== "all") return false;
    } else {
      if (type === "files" && !entry.isFile()) return false;
      if (type === "directories" && !entry.isDirectory()) return false;
    }
    return !ignore.some((pattern) => minimatch(entry.name, pattern, { dot: true }));
  });

  // Stable ordering for pagination
  filtered = filtered.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const total = filtered.length;
  if (total === 0) {
    return `No entries in ${stripLongPath(validPath)}`;
  }
  if (offset > total) {
    return `No entries in ${stripLongPath(validPath)} (offset ${offset} is beyond ${total} entries)`;
  }

  const start = offset - 1;
  const shown = filtered.slice(start, start + limit);

  const lines: string[] = [];
  for (const entry of shown) {
    let sizeText = "";
    if (includeSizes && entry.isFile()) {
      try {
        const stats = await fs.stat(path.join(validPath, entry.name));
        sizeText = ` (${stats.size} bytes)`;
      } catch {
        sizeText = "";
      }
    }
    lines.push(
      `${entry.isSymbolicLink() ? "[LINK]" : entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}${sizeText}`
    );
  }

  const end = start + shown.length;
  return `Showing ${offset}-${end} of ${total} entries in ${stripLongPath(validPath)}\n` + lines.join("\n");
}
