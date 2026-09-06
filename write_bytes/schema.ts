import { z } from "zod";

export const WriteBytesArgsSchema = z.object({
  path: z.string().describe("Path to the file to write (must already exist - no implicit create)"),
  offset: z.number().int().min(0).describe("Byte offset at which to write (0-indexed)"),
  dataBase64: z.string().describe("Base64-encoded bytes to write. Must be valid base64 (strict)."),
  extend: z.boolean().optional().default(false).describe("If true, grow the file when the write ends past EOF, zero-filling any gap between the old size and the offset. Default: false (write past EOF is an error)."),
});

