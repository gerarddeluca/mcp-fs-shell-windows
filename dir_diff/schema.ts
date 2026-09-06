import { z } from "zod";

export const DirDiffArgsSchema = z.object({
  dirA: z.string().describe("First directory (baseline). Files present only here are reported as removed."),
  dirB: z.string().describe("Second directory (comparison target). Files present only here are reported as added."),
  ignore: z.array(z.string()).optional().default([]).describe("Glob patterns (minimatch, same semantics as list_directory's ignore param) matched against each file's relative path; ignored paths are excluded from all lists and counts."),
  maxFiles: z.number().int().min(1).optional().describe("Cap on total files compared (union of both trees, after ignore). If the union exceeds it, the comparison stops and truncated=true; counts reflect only what was compared."),
});
