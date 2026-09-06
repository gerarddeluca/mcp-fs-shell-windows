import { z } from "zod";

export const ReadBytesArgsSchema = z.object({
  path: z.string().describe("Path to the file to read"),
  offset: z.number().int().min(0).describe("Byte offset to start reading from (0-indexed). Must be less than the file size."),
  length: z.number().int().min(1).describe("Number of bytes to read. If offset+length exceeds the file size, the read is clamped to EOF."),
});

