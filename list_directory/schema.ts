import { z } from "zod";

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  type: z.enum(["files", "directories", "all"]).optional().default("all").describe("What to return: \"files\", \"directories\", or \"all\". Default: \"all\"."),
  ignore: z.array(z.string()).optional().default([]).describe("Glob patterns to skip (e.g. [\"node_modules\", \"dist\", \"*.log\"])."),
  offset: z.number().int().min(1).optional().default(1).describe("1-indexed result number to start from. Default: 1."),
  limit: z.number().int().min(1).optional().default(100).describe("Maximum number of entries to return. Default: 100."),
  includeSizes: z.boolean().optional().default(true).describe("Include file sizes in the listing. Default: true (one stat per shown file entry)."),
});
