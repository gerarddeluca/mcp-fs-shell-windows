// run_javascript/schema.ts — argument schema for the unrestricted JS/TS execution tool.
// (MCP filesystem fork: the "free" run_javascript — no working-directory sandbox.)
import { z } from "zod";

// Unlike the shell tools (28 s cap), this tool may run up to 60 s: the MCP
// client request window was measured >63 s (a ~63 s in-harness tool call
// survived, 2026-08-29), and 60 s matches the sibling run_javascript tools.
export const RUN_JS_MAX_TIMEOUT_SEC = 60;

// ---------------------------------------------------------------------------
// Tool description (verbatim — pasted into server.ts ListTools entry):
//
// run_javascript_free:
//   "Run a JavaScript/TypeScript code snippet on the Deno runtime with UNRESTRICTED permissions: full filesystem read/write (any drive or UNC path the server user can reach), network access, environment variables, child processes, and arbitrary imports (node:*, npm:*, https:*) — unlike the other run_javascript tools, there is no working-directory sandbox. The code is written to a temp .ts file and run; returns exit code, stdout, and stderr. Default 5 s timeout, max 60 s; optional cwd (defaults to the shell_cwd default). Non-zero exit or timeout returns an error that still includes the captured output. Requires a Deno binary: $DENO_PATH, <LM Studio home>/.internal/utils/deno(.exe) (found by walking up from the server CWD or the user home), or deno on PATH."
// ---------------------------------------------------------------------------

export const RunJavascriptFreeArgsSchema = z.object({
  javascript: z
    .string()
    .describe(
      "JavaScript (or TypeScript) code to execute. Runs as a Deno script: Deno.* APIs, console.log, and imports (node:*, npm:*, https:*) all work.",
    ),
  timeout_seconds: z
    .number()
    .min(0.1)
    .max(RUN_JS_MAX_TIMEOUT_SEC)
    .optional()
    .describe("Timeout in seconds (default: 5, max: 60)."),
  cwd: z
    .string()
    .optional()
    .describe("Working directory for the snippet (default: the shell_cwd default)."),
});
