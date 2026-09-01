import { z } from "zod";

export const ReadFilesArgsSchema = z.object({
  paths: z.array(z.string()),
  offset: z.number().int().min(1).optional().describe("Start reading from this line number (1-indexed). Omit to read from the beginning."),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read per file. Omit to read to the end."),
});
