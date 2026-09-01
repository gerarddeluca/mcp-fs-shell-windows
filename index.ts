#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { normalizePath, expandHome } from "./helpers/path.js";
import { FilesystemServer } from "./server.js";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-fs-shell-windows <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
(async () => {
  try {
    await Promise.all(args.map(async (dir) => {
      try {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) {
          console.error(`Warning: ${dir} is not a directory; continuing without it`);
        }
      } catch (error) {
        console.error(`Warning: cannot access ${dir} (offline or invalid); continuing without it`);
      }
    }));

    // Start server
    const server = new FilesystemServer(allowedDirectories);
    await server.connect();
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
})();