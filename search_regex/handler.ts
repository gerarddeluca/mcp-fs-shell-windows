import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { minimatch } from "minimatch";

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

export async function handleSearchRegex(
  searchPath: string,
  pattern: string,
  filePatterns: string[],
  excludePatterns: string[],
  maxResults: number,
  caseSensitive: boolean,
  offset: number,
  allowedDirectories: string[],
  countOnly: boolean
): Promise<string> {
  // Validate root path (may be a directory or a single file)
  const validRootPath = await validatePath(searchPath, allowedDirectories);

  const results: SearchResult[] = [];
  const perFileCounts = new Map<string, number>();
  const filesSearchedList: string[] = [];
  let filesSearched = 0;
  let totalMatches = 0;
  const effectiveCap = offset - 1 + maxResults;

  // Create regex pattern
  const regexFlags = caseSensitive ? "mg" : "img";
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, regexFlags);
  } catch (error) {
    throw new Error(`Invalid regular expression: ${pattern}`);
  }

  async function scanFile(fullPath: string) {
    try {
      filesSearched++;
      filesSearchedList.push(fullPath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");

      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      // Every occurrence is counted (a line containing the pattern 4 times
      // counts as 4 matches). Line results are collected only while under the
      // pagination cap; counting always runs to completion so the reported
      // total is exact.
      while ((match = regex.exec(content)) !== null) {
        totalMatches++;
        perFileCounts.set(fullPath, (perFileCounts.get(fullPath) ?? 0) + 1);

        if (!countOnly && results.length < effectiveCap) {
          // Find the line number for this match
          const matchPosition = match.index;
          let lineNumber = 0;
          let charCount = 0;

          for (let i = 0; i < lines.length; i++) {
            charCount += lines[i].length + 1; // +1 for the newline
            if (charCount > matchPosition) {
              lineNumber = i + 1;
              break;
            }
          }

          // Get the line content
          const lineContent = lines[lineNumber - 1]?.trim() || "";

          results.push({
            file: fullPath,
            line: lineNumber,
            content: lineContent,
            match: match[0],
          });
        }

        // Guard against zero-length matches (e.g. pattern "a*") looping forever
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } catch (error) {
      // Skip files that can't be read as text
    }
  }

  async function searchDirectory(dirPath: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          // Validate each path before processing
          await validatePath(fullPath, allowedDirectories);

          // Check if path matches any exclude pattern
          const relativePath = path.relative(validRootPath, fullPath);
          const shouldExclude = excludePatterns.some((excludePattern) => {
            const globPattern = excludePattern.includes("*") ? excludePattern : `**/${excludePattern}/**`;
            return minimatch(relativePath, globPattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          if (entry.isDirectory()) {
            // Recursively search subdirectories
            await searchDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check if file matches the file patterns (if any were provided)
            const shouldInclude =
              filePatterns.length === 0 ||
              filePatterns.some((filePattern) => {
                return minimatch(entry.name, filePattern, { nocase: true });
              });

            if (shouldInclude) {
              await scanFile(fullPath);
            }
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

  const rootStat = await fs.stat(validRootPath);
  if (rootStat.isFile()) {
    // Single-file search: apply the same file-pattern filter to the name
    const shouldInclude =
      filePatterns.length === 0 ||
      filePatterns.some((filePattern) => minimatch(path.basename(validRootPath), filePattern, { nocase: true }));
    if (shouldInclude) {
      await scanFile(validRootPath);
    }
  } else {
    await searchDirectory(validRootPath);
  }

  // Total-match summary (always included), with per-file counts for the
  // files that contain at least one match, in first-match (walk) order.
  const matchedFileEntries = [...perFileCounts.entries()];
  const matchedFilesCount = matchedFileEntries.length;
  let matchedFilesList = "";
  for (const [file, count] of matchedFileEntries) {
    matchedFilesList += `  ${file}: ${count}\n`;
  }
  const totalLine = `Total matches: ${totalMatches} (${matchedFilesCount} files)\n`;

  // Format the results
  let output = "";
  const shown = countOnly ? [] : results.slice(offset - 1);

  if (countOnly) {
    // Counts only: total header, files searched, then a per-file count line
    // for EVERY searched file (0 for files with no matches).
    output = totalLine;
    output += `Searched ${filesSearched} files\n`;
    if (totalMatches > 0) {
      output += "\n";
      for (const file of filesSearchedList) {
        output += `  ${file}: ${perFileCounts.get(file) ?? 0}\n`;
      }
    }
  } else if (totalMatches === 0) {
    output = `No matches found for regex: ${pattern}\n`;
    output += `Searched ${filesSearched} files\n`;
    output += totalLine;
  } else if (shown.length === 0) {
    output = `Found ${totalMatches} matches in ${results.length} locations (offset ${offset} is beyond the collected range)\n`;
    output += "\n";
    output += totalLine;
    output += matchedFilesList;
  } else {
    const end = offset + shown.length - 1;
    output = `Found ${totalMatches} matches in ${results.length} locations (showing ${offset}-${end})`;
    output += "\n\n";

    // Group by file for more readable output
    const fileGroups = new Map<string, SearchResult[]>();

    for (const result of shown) {
      if (!fileGroups.has(result.file)) {
        fileGroups.set(result.file, []);
      }
      fileGroups.get(result.file)?.push(result);
    }

    for (const [file, fileResults] of fileGroups.entries()) {
      output += `File: ${file}\n`;

      for (const result of fileResults) {
        output += `  Line ${result.line}: ${result.content}\n`;
      }

      output += "\n";
    }

    output += totalLine;
    output += matchedFilesList;
  }

  return output;
}
