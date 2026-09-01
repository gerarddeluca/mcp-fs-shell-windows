import { z } from "zod";

// Options for patch operations
const PatchOptionsSchema = z.object({
  preserveIndentation: z.boolean().default(true).describe("Preserve indentation when replacing/inserting text")
});

export const PatchFilesArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to patch"),
      patches: z.array(
        z.object({
          startLine: z.number().int().min(1).describe("Line number where the patch starts (1-indexed). For insertBefore, the line to insert before (use total lines + 1 to append to the end)."),
          endLine: z.number().int().min(1).describe("Line number where the patch ends (1-indexed). Ignored for insertBefore."),
          newText: z.string().describe("Text to insert/replace with. Ignored for delete."),
          action: z.enum(["replace", "insertBefore", "delete"]).optional().default("replace").describe("replace (default): replace lines startLine-endLine with newText. insertBefore: insert newText before startLine. delete: remove lines startLine-endLine."),
        })
      ).describe("Array of patches to apply to this file")
    })
  ).describe("Array of files to patch"),
  dryRun: z.boolean().default(false).describe("Preview changes using git-style diff format"),
  options: PatchOptionsSchema.optional().describe("Options for controlling patch behavior")
});
