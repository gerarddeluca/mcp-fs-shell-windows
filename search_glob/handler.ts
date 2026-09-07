import fs from "fs/promises";
import path from "path";
import { validatePath, stripLongPath } from "../helpers/path.js";
import { minimatch } from "minimatch";

export async function handleSearchGlob(
  searchPath: string,
  pattern: string,
  excludePatterns: string[],
  maxResults: number,
  offset: number,
  allowedDirectories: string[]
): Promise<string> {
  // Validate root path
  const validRootPath = await validatePath(searchPath, allowedDirectories);

  const results: string[] = [];
  const effectiveCap = offset - 1 + maxResults;
  let searchAborted = false;

  async function findMatches(currentPath: string) {
    if (searchAborted) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (searchAborted) break;

        const fullPath = path.join(currentPath, entry.name);

        try {
          // Validate each path before processing
          await validatePath(fullPath, allowedDirectories);

          // Get relative path for glob matching
          const relativePath = path.relative(validRootPath, fullPath);

          // Check if path should be excluded
          const shouldExclude = excludePatterns.some((excludePattern) => {
            return minimatch(relativePath, excludePattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          // Check if the path matches the provided pattern
          if (minimatch(relativePath, pattern, { dot: true })) {
            results.push(fullPath);

            if (results.length >= effectiveCap) {
              searchAborted = true;
              break;
            }
          }

          // Recursively search directories
          if (entry.isDirectory()) {
            await findMatches(fullPath);
          }
        } catch (error) {
          // Skip invalid paths during search
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }

  await findMatches(validRootPath);

  // Format the results
  let output = "";

  if (results.length === 0) {
    output = `No files matching pattern: ${pattern}\n`;
  } else {
    // Sort results by path, then apply pagination
    results.sort();
    const shown = results.slice(offset - 1);
    const end = offset + shown.length - 1;

    output = `Found ${results.length} files matching pattern: ${pattern} (showing ${offset}-${end})`;
    if (searchAborted) {
      output += ` (search stopped at ${effectiveCap} collected files)`;
    }
    output += "\n\n";

    for (const result of shown) {
      output += `${stripLongPath(result)}\n`;
    }
  }

  return output;
}
