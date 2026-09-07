import { z } from "zod";

export const DeleteFilesArgsSchema = z.object({
  paths: z.array(z.string()).describe("Paths to files or directories to delete"),
  recursive: z.boolean().default(false).describe("Whether to recursively delete directories"),
  toRecycleBin: z.boolean().default(false).describe(
    "Windows only. When true, files and directories are sent to the Recycle Bin instead of being permanently deleted. " +
    "Reparse points (junctions/symlinks) are still removed as links, because the recycle bin cannot hold links. " +
    "Any path that cannot be recycled (or no longer exists) is reported as an error and is never permanently deleted as a fallback. " +
    "On non-Windows platforms this returns a clear error and deletes nothing."
  ),
});
