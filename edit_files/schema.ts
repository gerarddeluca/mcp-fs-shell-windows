import { z } from "zod";

export const EditFilesArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to edit"),
      edits: z.array(
        z.object({
          oldString: z.string().describe("Exact literal text to find. Must not be empty."),
          newString: z.string().describe("Replacement text. May be empty to delete the matched text."),
          replaceAll: z.boolean().optional().default(false).describe("When true, replace every occurrence. Default: require exactly one match."),
        })
      ).describe("Array of edits applied in order"),
    })
  ).describe("Array of files to edit"),
});
