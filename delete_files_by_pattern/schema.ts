import { z } from "zod";

export const DeleteFilesByPatternArgsSchema = z.object({
  directory: z.string().describe("Directory to scan (single level; subdirectories are not scanned)."),
  pattern: z.string().describe("Regular expression matched against each entry name (e.g. '^temp_.*\\.txt$')."),
  includeDirectories: z.boolean().optional().default(false).describe("Also delete matching directories (recursively). Default: false (files only)."),
});
