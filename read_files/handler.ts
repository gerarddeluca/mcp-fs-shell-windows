import fs from "fs/promises";
import { validatePath, stripLongPathAll } from "../helpers/path.js";
import {
  decodeText,
  detectEncoding,
  type TextEncoding,
} from "../helpers/encoding.js";

type ReadFileItem =
  | string
  | {
      path: string;
      encoding?: TextEncoding;
      offset?: number;
      limit?: number;
    };

export async function handleReadFiles(
  fileItems: ReadFileItem[],
  allowedDirectories: string[],
  offset?: number,
  limit?: number
): Promise<string> {
  const results = await Promise.all(
    fileItems.map(async (item) => {
      const filePath = typeof item === "string" ? item : item.path;
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const raw = await fs.readFile(validPath);

        // Decode with the file's explicit encoding when given, otherwise
        // auto-detect from the raw bytes (BOM, then strict UTF-8, else cp1252).
        const encoding: TextEncoding =
          (typeof item !== "string" && item.encoding) || detectEncoding(raw);
        const content = decodeText(raw, encoding);

        // Per-file offset/limit (object form) fall back to the global ones.
        const effOffset = (typeof item !== "string" && item.offset) || offset;
        const effLimit = (typeof item !== "string" && item.limit) || limit;

        // Split into lines, keeping original line numbers
        const lines = content.split("\n");
        const total = lines.length;

        let startLine = 1;
        let endLine = total;
        if (effOffset !== undefined || effLimit !== undefined) {
          startLine = effOffset ?? 1;
          if (startLine > total) {
            throw new Error(`offset ${startLine} is beyond end of file (${total} lines)`);
          }
          endLine = effLimit !== undefined ? Math.min(total, startLine + effLimit - 1) : total;
        }

        // Format content with line numbers
        const numberedContent = lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join("\n");

        const header =
          effOffset !== undefined || effLimit !== undefined
            ? `${filePath}: [lines ${startLine}-${endLine} of ${total}]\n`
            : `${filePath}:\n`;

        return `${header}${numberedContent}\n`;
      } catch (error) {
        const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
        return `${filePath}: Error - ${errorMessage}`;
      }
    }),
  );
  return results.join("\n---\n");
}
