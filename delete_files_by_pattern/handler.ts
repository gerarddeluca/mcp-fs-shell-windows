import fs from "fs/promises";
import path from "path";
import { validatePath, stripLongPath, stripLongPathAll } from "../helpers/path.js";

export async function handleDeleteFilesByPattern(
  directory: string,
  pattern: string,
  includeDirectories: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(directory, allowedDirectories);

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (error) {
    throw new Error(`Invalid regular expression: ${pattern}`);
  }

  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    if (!regex.test(entry.name)) continue;

    const fullPath = path.join(validPath, entry.name);
    try {
      if (entry.isDirectory()) {
        if (includeDirectories) {
          await fs.rm(fullPath, { recursive: true, force: true });
          deleted.push(`${stripLongPath(fullPath)} (directory)`);
        } else {
          skipped.push(`${stripLongPath(fullPath)} (directory; set includeDirectories: true to delete)`);
        }
      } else {
        await fs.unlink(fullPath);
        deleted.push(stripLongPath(fullPath));
      }
    } catch (error) {
      const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
      skipped.push(`${stripLongPath(fullPath)} (${errorMessage})`);
    }
  }

  let output = `Pattern "${pattern}" in ${stripLongPath(validPath)}:\n`;
  output += `- ${deleted.length} deleted\n`;
  if (skipped.length > 0) {
    output += `- ${skipped.length} skipped:\n` + skipped.map((s) => `  ${s}`).join("\n");
  }
  return output;
}
