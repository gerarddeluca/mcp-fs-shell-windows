import fs from "fs/promises";
import path from "path";
import { validatePath, ensureDirectoryExists, stripLongPathAll } from "../helpers/path.js";
import { encodeText, type TextEncoding } from "../helpers/encoding.js";

export async function handleWriteNewFiles(
  files: Array<{ path: string; content: string; overwrite?: boolean; encoding?: "utf8" | "base64"; textEncoding?: TextEncoding }>,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      try {
        const validPath = await validatePath(file.path, allowedDirectories);

        // Check if file already exists
        if (!file.overwrite) {
          try {
            await fs.access(validPath);
            // If we get here, the file exists
            throw new Error("File already exists. Pass overwrite: true to replace it, or use patch_files/edit_files to modify it.");
          } catch (accessError) {
            // File doesn't exist, which is what we want for this function
            if ((accessError as NodeJS.ErrnoException).code !== "ENOENT") {
              // Some other error occurred during access check
              throw accessError;
            }
          }
        }

        // Ensure parent directory exists
        const directory = path.dirname(validPath);
        await ensureDirectoryExists(directory);

        // Write file content
        if (file.encoding === "base64") {
          await fs.writeFile(validPath, Buffer.from(file.content, "base64"));
        } else {
          // textEncoding defaults to utf8 (byte-identical to the old behavior);
          // base64 above already handled the raw-bytes case.
          await fs.writeFile(validPath, encodeText(file.content, file.textEncoding ?? "utf8"));
        }

        results.push(`Successfully wrote to ${file.path}${file.overwrite ? " (overwritten)" : ""}`);
      } catch (error) {
        const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
        errors.push(`Failed to write file ${file.path}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;

  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files written successfully\n`;

  if (successCount > 0) {
    output += "Details:\n" + results.join("\n");
  }

  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  return output;
}
