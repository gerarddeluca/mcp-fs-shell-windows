import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

// Strict base64: groups of 4, with valid padding at the end.
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/;

export async function handleWriteBytes(
  filePath: string,
  offset: number,
  dataBase64: string,
  extend: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(filePath, allowedDirectories);

  let stats;
  try {
    stats = await fs.stat(validPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`File does not exist (write_bytes requires an existing file, no implicit create): ${filePath}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const size = stats.size;

  if (!BASE64_RE.test(dataBase64)) {
    throw new Error(`Invalid base64 in dataBase64: ${JSON.stringify(dataBase64.slice(0, 80))}`);
  }
  const data = Buffer.from(dataBase64, "base64");
  const end = offset + data.length;

  const handle = await fs.open(validPath, "r+");
  try {
    if (end > size) {
      if (!extend) {
        throw new Error(
          `Write would extend file past EOF: offset ${offset} + ${data.length} bytes = ${end} > file size ${size}; use extend=true to grow the file`
        );
      }
      await handle.truncate(end);
    }
    const { bytesWritten } = await handle.write(data, 0, data.length, offset);
    if (bytesWritten !== data.length) {
      throw new Error(`Short write: expected ${data.length} bytes at offset ${offset}, wrote ${bytesWritten}`);
    }
  } finally {
    await handle.close();
  }

  return JSON.stringify({
    path: filePath,
    offset,
    bytesWritten: data.length,
    size: Math.max(size, end),
  });
}

