import fs from "fs/promises";
import path from "path";
import { validatePath, ensureDirectoryExists } from "../helpers/path.js";
import {
  decodeText,
  detectEncoding,
  encodeText,
  type TextEncoding,
} from "../helpers/encoding.js";

export async function handleConvertEncoding(
  filePath: string,
  to: TextEncoding,
  from: TextEncoding | undefined,
  outPath: string,
  overwrite: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(filePath, allowedDirectories);
  const validOutPath = await validatePath(outPath, allowedDirectories);

  if (path.normalize(validPath) === path.normalize(validOutPath)) {
    throw new Error("outPath must differ from path");
  }

  // Check that outPath does not already exist (unless overwrite).
  if (!overwrite) {
    try {
      await fs.access(validOutPath);
      // If we get here, the file exists
      throw new Error("Output file already exists. Pass overwrite: true to replace it.");
    } catch (accessError) {
      if ((accessError as NodeJS.ErrnoException).code !== "ENOENT") {
        // Either the "already exists" error above, or some other access error
        throw accessError;
      }
    }
  }

  const raw = await fs.readFile(validPath);
  const sourceEncoding: TextEncoding = from ?? detectEncoding(raw);
  const text = decodeText(raw, sourceEncoding);
  const out = encodeText(text, to);

  const directory = path.dirname(validOutPath);
  await ensureDirectoryExists(directory);
  await fs.writeFile(validOutPath, out);

  return JSON.stringify(
    {
      path: filePath,
      outPath: outPath,
      from: sourceEncoding,
      to,
      bytesIn: raw.length,
      bytesOut: out.length,
    },
    null,
    2
  );
}
