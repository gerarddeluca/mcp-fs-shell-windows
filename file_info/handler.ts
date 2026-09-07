import fs from "fs/promises";
import { execFile } from "child_process";
import { validatePathPreservingLinks } from "../helpers/path.js";

// Best-effort NTFS attribute list (e.g. "Archive", "ReadOnly, Hidden") via a
// single encoded PowerShell call. The command string is built in JS with the
// path single-quote-escaped and then encoded as UTF-16LE Base64 for
// -EncodedCommand, which avoids all argv quoting/Unicode issues. Resolves
// null on any failure (missing powershell, timeout, bad path, ...).
function getWindowsAttributes(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let b64: string;
    try {
      const escaped = filePath.replace(/'/g, "''");
      const command = `(Get-Item -LiteralPath '${escaped}' -Force).Attributes.ToString()`;
      b64 = Buffer.from(command, "utf16le").toString("base64");
    } catch {
      resolve(null);
      return;
    }
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", b64],
      { timeout: 10000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const text = stdout.trim();
        resolve(text.length > 0 ? text : null);
      }
    );
  });
}

export interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

export async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

export async function handleGetFileInfo(
  filePath: string,
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePathPreservingLinks(filePath, allowedDirectories);
  
  const stats = await fs.stat(validPath);
  const linkStats = await fs.lstat(validPath);
  const formattedInfo: Record<string, string> = {
    path: filePath,
    size: `${stats.size} bytes`,
    type: stats.isDirectory() ? 'directory' : (stats.isFile() ? 'file' : 'other'),
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    permissions: stats.mode.toString(8).slice(-3),
    isReparsePoint: String(linkStats.isSymbolicLink())
  };
  
  if (process.platform === "win32") {
    const attributes = await getWindowsAttributes(validPath);
    if (attributes !== null) {
      formattedInfo.attributes = attributes;
    }
  }
  
  return Object.entries(formattedInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}