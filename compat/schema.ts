// compat/schema.ts — argument schemas for the 9 Beledarian-compatible alias tools.
// (MCP filesystem fork v0.2.28 — Beledarian-parity project, Stage 5 / task 3.)
//
// Purpose: same-named drop-ins for the Beledarian plugin tools so the fork can
// shadow/replace Beledarian with zero behavior change for existing prompts.
// Parameter names are kept EXACTLY as Beledarian's (reference:
// .beledarians-llm-toolbox/dev-src/beledarians-lm-studio-tools/src/toolsProvider.ts),
// plus the fork's own optional `cwd` where noted.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Timeout caps.
//
// The fork's native shell tools cap at 28 s (SHELL_MAX_TIMEOUT_SEC) to stay under
// the MCP client's request-kill window. Beledarian's execute_command / run_python
// / run_javascript all cap at 60 s (verified: the client window is >63 s).
// To be a zero-behavior-change drop-in, the compat tools keep Beledarian's 60 s cap.
// ---------------------------------------------------------------------------
export const COMPAT_SYNC_TIMEOUT_SEC = 60; // execute_command, run_python, run_javascript

// ---------------------------------------------------------------------------
// execute_command — compat alias of shell_run (bounded synchronous execution),
// with Beledarian's 60 s cap. Params match Beledarian exactly:
//   command, input?, timeout_seconds? (reference toolsProvider.ts L1155-1176).
// ---------------------------------------------------------------------------
export const ExecuteCommandArgsSchema = z.object({
  command: z.string().describe("The shell command to execute (Windows cmd.exe syntax)."),
  input: z.string().optional().describe("Input text to pipe to the command's stdin."),
  timeout_seconds: z.number().min(0.1).max(COMPAT_SYNC_TIMEOUT_SEC).optional().describe("Timeout in seconds (default: 5, max: 60)."),
});

// ---------------------------------------------------------------------------
// run_in_terminal — compat alias of shell_terminal (visible console window).
// Params match Beledarian exactly: command (reference L1317-1332).
// ---------------------------------------------------------------------------
export const RunInTerminalArgsSchema = z.object({
  command: z.string().describe("Command to run in the new terminal window."),
});

// ---------------------------------------------------------------------------
// run_test_command — compat alias of shell_test (test wrapper, CI=true, never
// errors on a failing test). Params match Beledarian exactly: command
// (reference L2303-2345).
// ---------------------------------------------------------------------------
export const RunTestCommandArgsSchema = z.object({
  command: z.string().describe("The test command to run (e.g. 'npm test', 'pytest')."),
});

// ---------------------------------------------------------------------------
// run_background_command — compat alias of shell_start (background job).
// Beledarian: command, timeout_hours (MANDATORY, max 10), name (MANDATORY)
// (reference L930-1010). Fork variant: name stays REQUIRED (as in Beledarian),
// timeout_hours gets the fork's default of 10 (max 10), and the fork's cwd
// override is available.
// ---------------------------------------------------------------------------
export const RunBackgroundCommandArgsSchema = z.object({
  command: z.string().describe("The command to run as a background job (Windows cmd.exe syntax)."),
  name: z.string().describe("MANDATORY: A short, descriptive name for the background task (e.g. 'Vite Dev Server')."),
  timeout_hours: z.number().max(10).optional().default(10).describe("Auto-kill the job after this many hours (default 10, max 10)."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

// ---------------------------------------------------------------------------
// check_background_command — compat alias of shell_check.
// Params match Beledarian exactly: id (reference L1013-1033).
// ---------------------------------------------------------------------------
export const CheckBackgroundCommandArgsSchema = z.object({
  id: z.string().describe("Job ID returned by run_background_command or run_in_terminal."),
});

// ---------------------------------------------------------------------------
// cancel_background_command — compat alias of shell_cancel.
// Params match Beledarian exactly: id (reference L1036-1054).
// ---------------------------------------------------------------------------
export const CancelBackgroundCommandArgsSchema = z.object({
  id: z.string().describe("Job ID returned by run_background_command or run_in_terminal."),
});

// ---------------------------------------------------------------------------
// run_python — compat alias of shell_python (temp .py + system python),
// with Beledarian's 60 s cap. Beledarian params: python, timeout_seconds?
// (reference L692-712); the fork's cwd override is available.
// ---------------------------------------------------------------------------
export const RunPythonArgsSchema = z.object({
  python: z.string().describe("Python code to execute (requires system Python on PATH)."),
  timeout_seconds: z.number().min(0.1).max(COMPAT_SYNC_TIMEOUT_SEC).optional().describe("Timeout in seconds (default: 5, max: 60)."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

// ---------------------------------------------------------------------------
// run_javascript — the CONFINED variant (NOT an alias of run_javascript_free).
// Beledarian params: javascript, timeout_seconds? (reference L612-633, impl
// L544-610). No cwd param (the reference confines to its working directory,
// which is the fork's shell_cwd default here).
// ---------------------------------------------------------------------------
export const RunJavascriptArgsSchema = z.object({
  javascript: z.string().describe("JavaScript (or TypeScript) code to execute. Runs as a Deno script confined to the working directory: Deno.* APIs and console.log work; network, env, sys, run, and ffi are denied."),
  timeout_seconds: z.number().min(0.1).max(COMPAT_SYNC_TIMEOUT_SEC).optional().describe("Timeout in seconds (default: 5, max: 60)."),
});

// ---------------------------------------------------------------------------
// save_memory — STANDALONE (no fork equivalent; not an alias).
// Beledarian param: fact (reference L509-542).
// ---------------------------------------------------------------------------
export const SaveMemoryArgsSchema = z.object({
  fact: z.string().describe("The specific fact or piece of information to remember."),
});
