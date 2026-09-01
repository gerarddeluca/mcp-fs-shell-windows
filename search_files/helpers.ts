import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import { validatePath } from "../helpers/path.js";

export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  allowedDirectories: string[],
  maxResults: number = 500,
  offset: number = 1
): Promise<{ results: string[]; stopped: boolean }> {
  const results: string[] = [];
  const effectiveCap = offset - 1 + maxResults;
  let stopped = false;

  async function search(currentPath: string) {
    if (stopped) return;

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (stopped) break;
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath, allowedDirectories);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some((excludePattern) => {
          // Handle different pattern formats
          // 1. If pattern already contains glob characters, use as is
          // 2. If pattern is a simple name, match anywhere in path
          // 3. If pattern is a path segment, match that segment
          let globPattern = excludePattern;

          if (!excludePattern.includes("*") && !excludePattern.includes("?")) {
            if (excludePattern.includes("/")) {
              globPattern = `**/${excludePattern}/**`;
            } else {
              globPattern = `**/*${excludePattern}*/**`;
            }
          }

          return minimatch(relativePath, globPattern, {
            dot: true,
            nocase: true,
            matchBase: true,
          });
        });

        if (shouldExclude) {
          continue;
        }

        // Case-insensitive filename matching
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
          if (results.length >= effectiveCap) {
            stopped = true;
            break;
          }
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return { results, stopped };
}
