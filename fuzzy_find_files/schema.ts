import { z } from "zod";

export const FuzzyFindFilesArgsSchema = z.object({
  query: z.string().describe("Search query to match against file names/paths (typo-tolerant)."),
  path: z.string().describe("Root directory to search in."),
  recursive: z.boolean().optional().default(true).describe("Recursively search subdirectories. Default: true."),
  maxResults: z.number().int().min(1).max(50).optional().default(5).describe("Maximum number of results to return. Default: 5."),
  scanLimit: z.number().int().min(1).optional().default(20000).describe("Maximum entries to scan before stopping (safety for huge trees/network shares). Default: 20000."),
});
