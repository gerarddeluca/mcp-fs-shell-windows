import { z } from "zod";

export const WriteNewFilesArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to write"),
      content: z.string().describe("Content to write to the file (UTF-8 text, or base64 when encoding is \"base64\")"),
      overwrite: z.boolean().optional().default(false).describe("Replace the file if it already exists. Default: false (fail if it exists)."),
      encoding: z.enum(["utf8", "base64"]).optional().default("utf8").describe("Content encoding. Use \"base64\" for binary files."),
    })
  ).describe("Array of files to write"),
});
