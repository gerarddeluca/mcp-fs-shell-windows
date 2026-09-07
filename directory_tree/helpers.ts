import fs from "fs/promises";
import path from "path";
import { minimatch } from 'minimatch';
import { validatePath } from "../helpers/path.js";

export interface TreeEntry {
  name: string;
  type: 'file' | 'directory' | 'link';
  children?: TreeEntry[];
}

export async function buildDirectoryTree(
  currentPath: string, 
  rootPath: string, 
  excludePatterns: string[] = [],
  allowedDirectories: string[]
): Promise<TreeEntry[]> {
  const validPath = await validatePath(currentPath, allowedDirectories);
  const entries = await fs.readdir(validPath, {withFileTypes: true});
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    
    // Check if path should be excluded based on patterns
    const relativePath = path.relative(rootPath, entryPath);
    const shouldExclude = excludePatterns.some(pattern => {
      // Apply same pattern logic as in searchFiles
      let globPattern = pattern;
      
      if (!pattern.includes('*') && !pattern.includes('?')) {
        if (pattern.includes('/')) {
          globPattern = `**/${pattern}/**`;
        } else {
          globPattern = `**/*${pattern}*/**`;
        }
      }
      
      return minimatch(relativePath, globPattern, { 
        dot: true,
        nocase: true,
        matchBase: true
      });
    });
    
    if (shouldExclude) {
      continue;
    }
    
    // Links (junctions/symlinks) are reported as type 'link' and never
    // recursed into, so their targets are never traversed.
    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : 'file'
    };

    if (entry.isDirectory()) {
      // Empty directories stay in the tree (children: []) - only EXCLUDED
      // entries are skipped.
      entryData.children = await buildDirectoryTree(entryPath, rootPath, excludePatterns, allowedDirectories);
    }

    result.push(entryData);
  }

  return result;
}