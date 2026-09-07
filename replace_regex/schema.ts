import { z } from "zod";

export const ReplaceRegexArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe(
      "Paths to the files to replace regex matches in. One or many FILES may be listed; directories are NOT accepted (a directory path is an error and nothing is written)."
    ),
  pattern: z
    .string()
    .describe("Regular expression pattern to match in each file (JavaScript regex syntax)."),
  replacement: z
    .string()
    .describe(
      "Replacement text for each match. Standard regex replacement syntax is supported (e.g. $1, ${name}, $&, $')."
    ),
  flags: z
    .string()
    .optional()
    .default("")
    .describe(
      "Additional regex flags (e.g. 'i' case-insensitive, 'm', 's', 'u'). The 'g' (global) flag is ALWAYS applied so every match is replaced; if you omit 'g' it is forced on."
    ),
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "When true (default), preview the WOULD-BE change per file (unified diff) without writing anything. When false, apply the replacements in place and report per-file match counts plus a total."
    ),
});
