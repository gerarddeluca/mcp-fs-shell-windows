import fs from "fs/promises";
import path from "path";
import { validatePathPreservingLinks, stripLongPath, stripLongPathAll } from "../helpers/path.js";

// Best-effort unlink that retries after clearing read-only flags, so plain
// directory trees delete as completely as fs.rm(..., { force: true }) did.
async function unlinkEntry(fullPath: string): Promise<void> {
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    try {
      await fs.chmod(fullPath, 0o666);
      await fs.unlink(fullPath);
    } catch {
      throw error;
    }
  }
}

// Recursively delete a real directory without following reparse points
// (junctions/symlinks): every entry is classified with lstat, links are
// removed as leaves, real directories are walked, files are unlinked.
async function rmRealDirectory(dir: string, errors: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    try {
      const st = await fs.lstat(fullPath);
      if (st.isSymbolicLink()) {
        await fs.unlink(fullPath);
      } else if (st.isDirectory()) {
        // The recursive call removes the directory itself
        await rmRealDirectory(fullPath, errors);
      } else {
        await unlinkEntry(fullPath);
      }
    } catch (error) {
      errors.push(
        stripLongPath(fullPath) +
          ": " +
          stripLongPathAll(error instanceof Error ? error.message : String(error))
      );
    }
  }
  try {
    await fs.rmdir(dir);
  } catch (error) {
    errors.push(
      stripLongPath(dir) + ": " + stripLongPathAll(error instanceof Error ? error.message : String(error))
    );
  }
}

export async function handleDeleteFiles(
  paths: string[],
  recursive: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];
  const linkResults: string[] = [];

  await Promise.all(
    paths.map(async (filePath) => {
      try {
        // Validate path is within allowed directories without following
        // reparse points (the link itself must be what gets classified)
        const validPath = await validatePathPreservingLinks(filePath, allowedDirectories);
        
        // Classify with lstat so reparse points are never followed
        const stats = await fs.lstat(validPath);
        
        if (stats.isSymbolicLink()) {
          // Junction/symlink: always removed as a leaf, with or without the
          // recursive flag. The link target is never touched.
          await fs.unlink(validPath);
          results.push(`Successfully deleted link: ${filePath} (link removed; target untouched)`);
          linkResults.push(filePath);
        } else if (stats.isDirectory()) {
          if (recursive) {
            const dirErrors: string[] = [];
            await rmRealDirectory(validPath, dirErrors);
            if (dirErrors.length > 0) {
              throw new Error(dirErrors.join("; "));
            }
            results.push(`Successfully deleted directory: ${filePath}`);
          } else {
            throw new Error("Cannot delete directory without recursive flag");
          }
        } else {
          // Delete the file
          await unlinkEntry(validPath);
          results.push(`Successfully deleted file: ${filePath}`);
        }
      } catch (error) {
        const errorMessage = stripLongPathAll(error instanceof Error ? error.message : String(error));
        errors.push(`Failed to delete ${filePath}: ${errorMessage}`);
      }
    })
  );

  // Format the results
  const successCount = results.length;
  const errorCount = errors.length;
  
  let output = `Processed ${successCount + errorCount} paths:\n`;
  output += `- ${successCount} items deleted successfully\n`;
  if (linkResults.length > 0) {
    output += `- ${linkResults.length} reparse point(s) removed (link removed; target untouched): ${linkResults.join(", ")}\n`;
  }
  
  if (errorCount > 0) {
    output += `- ${errorCount} items failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }
  
  return output;
}