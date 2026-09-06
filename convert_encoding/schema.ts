import { z } from "zod";

export const ConvertEncodingArgsSchema = z.object({
  path: z.string().describe("Path to the source file to read"),
  to: z
    .enum(["utf8", "utf16le", "utf16be", "cp1252"])
    .describe("Target encoding (utf16le/utf16be output includes a BOM; utf8/cp1252 do not)"),
  from: z
    .enum(["utf8", "utf16le", "utf16be", "cp1252"])
    .optional()
    .describe("Source encoding. Omit to auto-detect from the file's bytes (BOM FF FE -> utf16le, FE FF -> utf16be, EF BB BF -> utf8, otherwise strict UTF-8 -> utf8, else cp1252)"),
  outPath: z
    .string()
    .describe("Path of the file to write. Must differ from path and must not already exist unless overwrite=true"),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace outPath if it already exists. Default: false (fail if it exists)"),
});
