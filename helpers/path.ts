import fs from "fs/promises";
import path from "path";
import os from 'os';

// Normalize all paths consistently
export function normalizePath(p: string): string {
  return path.normalize(p);
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security utilities
export async function validatePath(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // Target doesn't exist yet: walk up to the nearest existing ancestor
    // and verify it is within an allowed directory
    let ancestor = path.dirname(absolute);
    let realAncestor: string | null = null;
    while (true) {
      try {
        realAncestor = await fs.realpath(ancestor);
        break;
      } catch {
        const up = path.dirname(ancestor);
        if (up === ancestor) {
          break;
        }
        ancestor = up;
      }
    }
    if (realAncestor === null) {
      throw new Error(`Parent directory does not exist: ${path.dirname(absolute)}`);
    }
    const normalizedAncestor = normalizePath(realAncestor);
    const isAncestorAllowed = allowedDirectories.some(dir => normalizedAncestor.startsWith(dir));
    if (!isAncestorAllowed) {
      throw new Error("Access denied - parent directory outside allowed directories");
    }
    return absolute;
  }
}

// Create a directory (and parents) if needed. Tolerates volume roots,
// which Node's recursive mkdir can reject with EPERM on Windows.
export async function ensureDirectoryExists(dir: string): Promise<void> {
  try {
    const stats = await fs.stat(dir);
    if (stats.isDirectory()) {
      return;
    }
  } catch {
    // Doesn't exist or is inaccessible - fall through and try to create
  }
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EEXIST') {
      return;
    }
    throw error;
  }
}