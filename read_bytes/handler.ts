import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

export async function handleReadBytes(
  filePath: string,
  offset: number,
  length: number,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(filePath, allowedDirectories);

  let stats;
  try {
    stats = await fs.stat(validPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`File does not exist: ${filePath}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const size = stats.size;
  if (offset >= size) {
    throw new Error(`offset beyond EOF: offset ${offset} >= file size ${size}`);
  }

  const actualLength = Math.min(length, size - offset);
  const buffer = Buffer.alloc(actualLength);
  const handle = await fs.open(validPath, "r");
  try {
    const { bytesRead } = await handle.read(buffer, 0, actualLength, offset);
    if (bytesRead !== actualLength) {
      throw new Error(`Short read: expected ${actualLength} bytes at offset ${offset}, got ${bytesRead}`);
    }
  } finally {
    await handle.close();
  }

  return JSON.stringify({
    path: filePath,
    offset,
    length,
    actualLength,
    size,
    dataBase64: buffer.toString("base64"),
  });
}

