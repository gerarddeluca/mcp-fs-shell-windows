import { z } from "zod";

export const WaitForFileArgsSchema = z.object({
  path: z.string().describe("Base directory to watch (must be inside an allowed root). The glob is matched against each file's path relative to this directory."),
  glob: z.string().describe("Glob pattern matched against each file's path relative to path (same glob machinery as search_glob: minimatch with dot:true; on Windows backslashes in the pattern are treated as path separators, so 'a\\b\\*.txt' and 'a/b/*.txt' both work)."),
  timeoutMs: z.number().int().min(0).max(300000).optional().default(30000).describe("Maximum time to wait, in milliseconds (default 30000, max 300000)."),
  intervalMs: z.number().int().min(100).max(300000).optional().default(500).describe("Poll interval, in milliseconds (default 500, min 100)."),
});
