import { z } from "zod";

// analyze_project takes no parameters: it operates on the current working
// directory (the shell_cwd default CWD — the fork's equivalent of the
// reference's currentWorkingDirectory).
export const AnalyzeProjectArgsSchema = z.object({});
