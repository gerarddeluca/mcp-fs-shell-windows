// shell/schema.ts — argument schemas for the 8 shell_* tools.
// (MCP filesystem fork; standalone shell layer that survives Beledarian being disabled.)
import { z } from "zod";

// The MCP client kills tool requests that run for "tens of seconds" (error -32001).
// Measured 2026-08-29: a ~63 s in-harness tool call survived (Beledarian's own
// 60 s cap fired first), so the client window is >63 s. 28 s keeps a wide margin.
// Anything longer belongs in the background-job registry (shell_start).
export const SHELL_MAX_TIMEOUT_SEC = 28;

// ---------------------------------------------------------------------------
// Tool descriptions (verbatim — pasted into server.ts ListTools entries):
//
// shell_run:
//   "Execute a shell command synchronously and return exit code, stdout, and stderr. Host is Windows; use cmd.exe syntax (e.g. `dir C:\\`, `powershell -NoProfile -Command ...`). Optional input is piped to the command's stdin. Optional cwd overrides the default working directory (see shell_cwd). Bounded: default 5 s timeout, max 28 s — for anything longer use shell_start (background job) and poll with shell_check. Non-zero exit or timeout returns an error that still includes the captured output."
//
// shell_test:
//   "Execute a test command (e.g. `npm test`, `pytest`) and return {command, exit_code, stdout, stderr, passed}. Never errors on a failing test. Runs with CI=true. Host is Windows; use cmd.exe syntax. Bounded to 28 s by the MCP client timeout — for longer suites use shell_start + shell_check."
//
// shell_start:
//   "Start a long-running shell command as a background job and return immediately with a job ID. Host is Windows; use cmd.exe syntax. The job keeps running inside this MCP server process; output is captured (last 256 KB of stdout/stderr) and appended to a log file. Auto-killed after timeout_hours (default 10, max 10). Poll with shell_check; kill with shell_cancel. Optional cwd overrides the default working directory (see shell_cwd)."
//
// shell_check:
//   "Check the status and output of a shell background job started with shell_start (or a shell_terminal window). Returns {id, name, status, exitCode, duration_seconds, stdout_tail, stderr_tail, logFile}. Status values: running, completed, error, cancelled, timeout."
//
// shell_cancel:
//   "Kill a running shell job (from shell_start or shell_terminal) by job ID. Kills the whole process tree."
//
// shell_terminal:
//   "Open a visible, separate, interactive cmd.exe console window (Windows) that runs the given command (as a batch file) with cmd /k. The window has its own console (the user can type into it) and persists after the command finishes. Use it for interactive sessions (ssh, REPLs, TUI programs, prompted installers) - the one case shell_start cannot cover. Returns a job ID with the window's PID; close the window (kill the whole tree) with shell_cancel. Optional cwd sets the window's starting directory."
//
// shell_python:
//   "Execute a Python code snippet (requires system Python on PATH). Writes the code to a temp .py file and runs it. Returns exit code, stdout, stderr. Default 5 s timeout, max 28 s; optional cwd. Non-zero exit returns an error that still includes the captured output."
//
// shell_cwd:
//   "Get or set the default working directory used by the other shell_* tools. With no argument returns the current default; with path sets it (must be an existing directory). The default starts as the MCP server process's CWD and resets when the server restarts."
// ---------------------------------------------------------------------------

export const ShellRunArgsSchema = z.object({
  command: z.string().describe("The shell command to execute (Windows cmd.exe syntax)."),
  input: z.string().optional().describe("Input text to pipe to the command's stdin."),
  timeout_seconds: z.number().min(0.1).max(SHELL_MAX_TIMEOUT_SEC).optional().describe("Timeout in seconds (default: 5, max: 28). For anything longer use shell_start + shell_check."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

export const ShellTestArgsSchema = z.object({
  command: z.string().describe("The test command to run (e.g. 'npm test', 'pytest')."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

export const ShellStartArgsSchema = z.object({
  command: z.string().describe("The command to run as a background job (Windows cmd.exe syntax)."),
  name: z.string().optional().default("shelljob").describe("Short label for the job."),
  timeout_hours: z.number().max(10).optional().default(10).describe("Auto-kill the job after this many hours (default 10, max 10)."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

export const ShellCheckArgsSchema = z.object({
  id: z.string().describe("Job ID returned by shell_start or shell_terminal."),
});

export const ShellCancelArgsSchema = z.object({
  id: z.string().describe("Job ID returned by shell_start or shell_terminal."),
});

export const ShellTerminalArgsSchema = z.object({
  command: z.string().describe("Command to run in the new window."),
  cwd: z.string().optional().describe("Starting directory for the window (default: the shell_cwd default)."),
});

export const ShellPythonArgsSchema = z.object({
  python: z.string().describe("Python code to execute (requires system Python on PATH)."),
  timeout_seconds: z.number().min(0.1).max(SHELL_MAX_TIMEOUT_SEC).optional().describe("Timeout in seconds (default: 5, max: 28)."),
  cwd: z.string().optional().describe("Working directory override (default: the shell_cwd default)."),
});

export const ShellCwdArgsSchema = z.object({
  path: z.string().optional().describe("Directory to set as the new default. Omit to just get the current default."),
});
