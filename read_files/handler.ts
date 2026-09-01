import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

export async function handleReadFiles(
  filePaths: string[],
  allowedDirectories: string[],
  offset?: number,
  limit?: number
): Promise<string> {
  const results = await Promise.all(
    filePaths.map(async (filePath: string) => {
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const content = await fs.readFile(validPath, "utf-8");

        // Split into lines, keeping original line numbers
        const lines = content.split("\n");
        const total = lines.length;

        let startLine = 1;
        let endLine = total;
        if (offset !== undefined || limit !== undefined) {
          startLine = offset ?? 1;
          if (startLine > total) {
            throw new Error(`offset ${startLine} is beyond end of file (${total} lines)`);
          }
          endLine = limit !== undefined ? Math.min(total, startLine + limit - 1) : total;
        }

        // Format content with line numbers
        const numberedContent = lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join("\n");

        const header =
          offset !== undefined || limit !== undefined
            ? `${filePath}: [lines ${startLine}-${endLine} of ${total}]\n`
            : `${filePath}:\n`;

        return `${header}${numberedContent}\n`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `${filePath}: Error - ${errorMessage}`;
      }
    }),
  );
  return results.join("\n---\n");
}
