import { z } from "zod";

export const SearchRegexArgsSchema = z.object({
  path: z.string().describe("Root directory to search in, or a single file to search"),
  pattern: z.string().describe("Regular expression pattern to search for in file contents"),
  filePatterns: z.array(z.string()).optional().default([]).describe("File patterns to include (e.g. '*.js', '*.ts')"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Patterns to exclude from search"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
  offset: z.number().int().min(1).optional().default(1).describe("1-indexed match number to start from. Default: 1."),
  caseSensitive: z.boolean().optional().default(false).describe("Whether the search should be case-sensitive"),
  countOnly: z.boolean().optional().default(false).describe("When true, return only per-file match counts and the total (no matching line text). Default: false."),
});
