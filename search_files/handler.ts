import { validatePath, stripLongPath } from "../helpers/path.js";
import { searchFiles } from "./helpers.js";

export async function handleSearchFiles(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  maxResults: number,
  offset: number,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const { results, stopped } = await searchFiles(
    validPath,
    pattern,
    excludePatterns,
    allowedDirectories,
    maxResults,
    offset
  );

  const shown = results.slice(offset - 1);
  if (shown.length === 0) {
    return stopped
      ? `Found at least ${offset - 1} matching files, but offset ${offset} is beyond the collected range`
      : "No matches found";
  }

  const end = offset + shown.length - 1;
  const totalText = stopped ? `at least ${results.length}` : `${results.length}`;
  return `Found ${totalText} files matching "${pattern}" (showing ${offset}-${end})\n\n` + shown.map(stripLongPath).join("\n");
}
