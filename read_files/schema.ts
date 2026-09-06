import { z } from "zod";

export const ReadFileItemSchema = z.union([
  z.string().describe("Path to the file to read"),
  z.object({
    path: z.string().describe("Path to the file to read"),
    encoding: z
      .enum(["utf8", "utf16le", "utf16be", "cp1252"])
      .optional()
      .describe("Decoding to use for this file (a matching BOM is stripped). Omit to auto-detect from the file's bytes (BOM FF FE -> utf16le, FE FF -> utf16be, EF BB BF -> utf8, otherwise strict UTF-8 -> utf8, else cp1252)"),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Start reading from this line number (1-indexed). Overrides the global offset for this file."),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of lines to read for this file. Overrides the global limit."),
  }),
]);

export const ReadFilesArgsSchema = z.object({
  paths: z
    .array(ReadFileItemSchema)
    .describe("Files to read. Each item is a plain path string, or an object {path, encoding?, offset?, limit?}."),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Start reading from this line number (1-indexed). Omit to read from the beginning."),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of lines to read per file. Omit to read to the end."),
});
