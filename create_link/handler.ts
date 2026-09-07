import fs from "fs/promises";
import path from "path";
import { validatePath, stripLongPathAll } from "../helpers/path.js";

export async function handleCreateLink(
  target: string,
  linkPath: string,
  type: string,
  allowedDirectories: string[]
): Promise<string> {
  // Both paths go through the repo's standard path validation (allow-root
  // checks, nearest-existing-ancestor handling for not-yet-existing paths,
  // long-path normalization at the single choke point).
  const linkAbs = await validatePath(linkPath, allowedDirectories);
  const targetAbs = await validatePath(target, allowedDirectories);

  // The target must exist. lstat so a link target is classified as itself.
  let targetStats;
  try {
    targetStats = await fs.lstat(targetAbs);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Target does not exist: ${target}`);
    }
    throw error;
  }

  // The link path must NOT already exist (lstat: an existing reparse point
  // is caught here too, not followed past).
  let linkExists = false;
  try {
    await fs.lstat(linkAbs);
    linkExists = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
  if (linkExists) {
    throw new Error(`Link path already exists: ${linkPath}`);
  }

  // The link path's parent directory must exist (NOT auto-created).
  const linkParentAbs = path.dirname(linkAbs);
  let parentStats;
  try {
    parentStats = await fs.stat(linkParentAbs);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Parent directory does not exist: ${path.dirname(linkPath)} (create_link does not auto-create parent directories)`
      );
    }
    throw error;
  }
  if (!parentStats.isDirectory()) {
    throw new Error(`Parent path is not a directory: ${path.dirname(linkPath)}`);
  }

  let createdKind: string;
  if (type === "hardlink") {
    if (targetStats.isDirectory()) {
      throw new Error(
        `hardlink target must be a file, but target is a directory: ${target}`
      );
    }
    // Second name for the same file. Same volume required - a cross-volume
    // attempt surfaces the natural EXDEV error.
    await fs.link(targetAbs, linkAbs);
    createdKind = "hardlink";
  } else if (type === "junction") {
    if (process.platform !== "win32") {
      throw new Error("junction links are only supported on Windows (win32)");
    }
    if (!targetStats.isDirectory()) {
      throw new Error(
        `junction target must be a directory, but target is a file: ${target}`
      );
    }
    await fs.symlink(targetAbs, linkAbs, "junction");
    createdKind = "junction";
  } else {
    // 'auto' (default) and 'symlink': real symlink, mode chosen by the
    // target's type. 'auto' NEVER creates a junction - junctions must be
    // explicit.
    if (targetStats.isDirectory()) {
      await fs.symlink(targetAbs, linkAbs, "dir");
      createdKind = "symlink (directory)";
    } else {
      await fs.symlink(targetAbs, linkAbs, "file");
      createdKind = "symlink (file)";
    }
  }

  // User-supplied strings are echoed back verbatim; stripLongPathAll guards
  // against any extended-length form leaking into the response.
  return stripLongPathAll(`Created ${createdKind} link: ${linkPath} -> ${target}`);
}
