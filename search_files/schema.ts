import { z } from "zod";

export const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
  maxResults: z.number().optional().default(500).describe("Maximum number of results to return. Default: 500."),
  offset: z.number().int().min(1).optional().default(1).describe("1-indexed result number to start from. Default: 1."),
});
