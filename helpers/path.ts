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

// --- Windows long-path (\\?\) support -------------------------------------
//
// Windows limits plain API paths to 260 characters (MAX_PATH) unless the
// path is given in extended-length form: \\?\C:\... for drive paths and
// \\?\UNC\server\share\... for UNC paths. When the machine-level long-path
// policy (LongPathsEnabled) is off - or for maximum portability - file
// operations on longer plain paths fail with ENOENT. Converting validated
// paths to extended-length form removes the 260-char ceiling.
//
// toLongPath() is applied at the END of path validation (validatePath /
// validatePathPreservingLinks) so every handler inherits it through that
// single choke point. stripLongPath() is the display inverse: user-facing
// output must never contain the \\?\ prefix.

const LONG_PREFIX = "\\\\?\\"; // \\?\
const LONG_UNC_PREFIX = "\\\\?\\UNC\\"; // \\?\UNC\

// Convert an absolute path to Windows extended-length form. No-op guard:
// win32 only. Returns unchanged when already extended-length. Drive paths
// are prefixed only when longer than 255 chars; UNC paths are always
// prefixed (the \\?\UNC\ form is equivalent at any length).
export function toLongPath(absPath: string): string {
  if (process.platform !== "win32") return absPath;
  if (absPath.startsWith(LONG_PREFIX) || absPath.startsWith("//?/")) return absPath;
  if (/^[A-Za-z]:\\/.test(absPath) && absPath.length > 255) {
    return LONG_PREFIX + absPath;
  }
  if (absPath.startsWith("\\\\")) {
    return LONG_UNC_PREFIX + absPath.slice(2);
  }
  return absPath;
}

// Display inverse of toLongPath: strip a leading extended-length prefix
// (the UNC form comes back with a normal double leading backslash).
export function stripLongPath(p: string): string {
  if (p.startsWith(LONG_UNC_PREFIX)) return "\\\\" + p.slice(LONG_UNC_PREFIX.length);
  if (p.startsWith(LONG_PREFIX)) return p.slice(LONG_PREFIX.length);
  if (p.startsWith("//?/UNC/")) return "//" + p.slice(7);
  if (p.startsWith("//?/")) return p.slice(4);
  return p;
}

// Sanitize a string (e.g. an error message) that may embed extended-length
// paths: replace every occurrence of a prefix with its plain equivalent.
export function stripLongPathAll(s: string): string {
  return s
    .split(LONG_UNC_PREFIX)
    .join("\\\\")
    .split(LONG_PREFIX)
    .join("")
    .split("//?/UNC/")
    .join("//")
    .split("//?/")
    .join("");
}

// Security utilities
export async function validatePath(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  // Extended-length (\\?\) inputs are normalized to their plain form first,
  // so resolution and allow-root checks run against the original shape;
  // the prefix is (re-)applied at the end of validation. The allow-roots
  // check below therefore still runs on the ORIGINAL (unprefixed) path.
  const plain = stripLongPath(expandedPath);
  const absolute = path.isAbsolute(plain)
    ? path.resolve(plain)
    : path.resolve(process.cwd(), plain);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = stripLongPath(await fs.realpath(absolute));
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return toLongPath(realPath);
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
    return toLongPath(absolute);
  }
}

// Like validatePath, but for tools that must classify/operate on the path
// ITSELF without following reparse points (junctions/symlinks): verifies the
// literal path is within an allowed directory, keeps the symlink-escape guard
// (a path that resolves OUTSIDE the allowed directories is rejected), but
// returns the UN-resolved path. Dangling links and not-yet-existing paths are
// validated via the nearest existing ancestor, exactly like validatePath.
export async function validatePathPreservingLinks(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  // Same as validatePath: normalize extended-length (\\?\) inputs to their
  // plain form first, then re-apply the prefix at the end.
  const plain = stripLongPath(expandedPath);
  const absolute = path.isAbsolute(plain)
    ? path.resolve(plain)
    : path.resolve(process.cwd(), plain);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Symlink-escape guard: if the path resolves outside the allowed
  // directories, reject (same policy as validatePath).
  try {
    const realPath = stripLongPath(await fs.realpath(absolute));
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied")) {
      throw error;
    }
    // Target doesn't exist yet (or is a dangling link): walk up to the
    // nearest existing ancestor and verify it is within an allowed directory
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
  }

  // Return the literal (normalized) path - reparse points NOT followed.
  // Extended-length form is applied last, exactly like validatePath.
  return toLongPath(normalizedRequested);
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