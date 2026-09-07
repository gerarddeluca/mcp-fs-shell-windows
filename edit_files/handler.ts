import fs from "fs/promises";
import { validatePath, stripLongPathAll } from "../helpers/path.js";

interface EditSpec {
  path: string;
  edits: Array<{ oldString: string; newString: string; replaceAll: boolean }>;
}

// Detect the dominant line ending of a file so it can be preserved on write.
function detectEol(text: string): string {
  if (text.includes("\r\n")) return "\r\n";
  if (text.includes("\r")) return "\r";
  return "\n";
}

const toLf = (t: string): string => t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const fromLf = (t: string, eol: string): string => (eol === "\n" ? t : t.replace(/\n/g, eol));

export async function handleEditFiles(files: EditSpec[], allowedDirectories: string[]): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const validPath = await validatePath(file.path, allowedDirectories);
      const raw = await fs.readFile(validPath, "utf-8");
      const eol = detectEol(raw);
      let current = toLf(raw);

      const editLog: string[] = [];
      for (let i = 0; i < file.edits.length; i++) {
        const { oldString, newString, replaceAll } = file.edits[i];
        const oldN = toLf(oldString);
        const newN = toLf(newString);

        if (oldN.length === 0) {
          throw new Error(`Edit ${i + 1}: oldString must not be empty`);
        }

        const count = current.split(oldN).length - 1;
        if (count === 0) {
          throw new Error(`Edit ${i + 1}: oldString not found`);
        }
        if (!replaceAll && count > 1) {
          throw new Error(
            `Edit ${i + 1}: oldString matched ${count} times (expected exactly 1; set replaceAll: true to replace all)`
          );
        }

        current = current.split(oldN).join(newN);
        editLog.push(`Edit ${i + 1}: replaced ${replaceAll ? count : 1} occurrence(s)`);
      }

      // Write back with the file's original dominant line ending.
      await fs.writeFile(validPath, fromLf(current, eol), "utf-8");
      results.push(`File: ${file.path}\n${editLog.join("\n")}`);
    } catch (error) {
      const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
      errors.push(`Failed to edit ${file.path}: ${errorMessage}`);
    }
  }

  const successCount = results.length;
  const errorCount = errors.length;

  let output = `Processed ${successCount + errorCount} files:\n`;
  output += `- ${successCount} files edited successfully\n`;

  if (errorCount > 0) {
    output += `- ${errorCount} files failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  if (successCount > 0) {
    output += "\n\nEdit details:\n" + "=".repeat(40) + "\n";
    output += results.join("\n" + "=".repeat(40) + "\n");
  }

  return output;
}
