import { z } from "zod";

export const CreateLinkArgsSchema = z.object({
  target: z
    .string()
    .describe(
      "Existing file or directory the new link will point to. " +
        "Must exist (lstat-checked; clear error otherwise). " +
        "Must be within allowed directories."
    ),
  linkPath: z
    .string()
    .describe(
      "Path at which the link object is created. " +
        "Must NOT already exist (clear error); its parent directory must already exist " +
        "(clear error - it is NOT auto-created). " +
        "Must be within allowed directories."
    ),
  type: z
    .enum(["auto", "symlink", "junction", "hardlink"])
    .optional()
    .default("auto")
    .describe(
      "Link type to create. " +
        "'auto' (default) and 'symlink' create a real symlink based on the target's type: " +
        "directory target -> directory symlink, file target -> file symlink " +
        "('auto' never creates a junction - junctions must be explicit). " +
        "'junction' creates a directory junction (Windows only; target must be a directory). " +
        "'hardlink' creates a second name for an existing file " +
        "(target must be a file; same volume - cross-volume errors surface naturally)."
    ),
});
