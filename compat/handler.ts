// compat/handler.ts — Beledarian-compatible alias handlers (MCP filesystem fork v0.2.28).
//
// Reference: .beledarians-llm-toolbox/dev-src/beledarians-lm-studio-tools/src/toolsProvider.ts.
// Every handler either delegates to the fork's own tool handler (so behavior and
// job-registry lifetime are identical) or reuses the fork's shell-layer spawn
// machinery (runCaptured + cap) with Beledarian's 60 s timeout cap, so existing
// prompts that pass timeout_seconds up to 60 behave exactly as under Beledarian.
//
// Deliberate deviations (documented per the task spec):
//   * execute_command / run_python / run_javascript keep Beledarian's 60 s cap
//     (the fork's native shell_* tools cap at 28 s). Same bounded synchronous
//     semantics, same cmd.exe /d /c verbatim spawn path.
//   * save_memory has NO enable gate (the fork has no such setting); the memory
//     file path = env MCP_MEMORY_FILE if set, else the Beledarian workspace
//     memory.md, created with a '# Long-Term Memory' header if missing.
//   * run_javascript env = { ...process.env, NO_COLOR: "true" } (Beledarian's
//     reference passed only NO_COLOR, which strips PATH; spreading process.env
//     keeps the confined Deno spawn robust and matches run_javascript_free).
import fsp from "fs/promises";
import fs from "fs";
import nodePath from "path";
import crypto from "crypto";
import {
  cap,
  CAP_OK,
  CAP_ERR,
  SHELL_JOBS_DIR,
  ensureJobsDir,
  resolveCwd,
  runCaptured,
  handleShellTest,
  handleShellStart,
  handleShellCheck,
  handleShellCancel,
  handleShellTerminal,
} from "../shell/handler.js";
import { resolveDenoPath } from "../run_javascript/handler.js";
import { COMPAT_SYNC_TIMEOUT_SEC } from "./schema.js";

// ---------------------------------------------------------------------------
// execute_command — bounded synchronous execution (alias of shell_run, 60 s cap)
// Mirrors handleShellRun exactly (cmd.exe /d /c, verbatim, stdin pipe) with
// Beledarian's 60 s cap and the same result shape: {command, exitCode, stdout,
// stderr, timedOut, duration_ms, cwd}; non-zero exit / timeout throw with the
// captured output embedded (callTool turns that into isError content).
// ---------------------------------------------------------------------------
export async function handleExecuteCommand(
  command: string,
  input?: string,
  timeoutSeconds?: number,
): Promise<string> {
  const abs = await resolveCwd();
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), COMPAT_SYNC_TIMEOUT_SEC);
  const started = Date.now();
  const r = await runCaptured("cmd.exe", ["/d", "/c", command], {
    cwd: abs,
    input,
    timeoutMs: timeout * 1000,
    verbatim: true,
  });
  const durationMs = Date.now() - started;
  if (r.spawnError) {
    throw new Error(`Failed to launch command: ${r.spawnError}`);
  }
  if (r.timedOut) {
    throw new Error(
      `Process timed out after ${timeout}s.\nSTDOUT:\n${cap(r.stdout, CAP_ERR)}\nSTDERR:\n${cap(r.stderr, CAP_ERR)}`,
    );
  }
  if (r.code !== 0) {
    throw new Error(
      `Process exited with code ${r.code ?? "unknown"}.\nSTDOUT:\n${cap(r.stdout, CAP_ERR)}\nSTDERR:\n${cap(r.stderr, CAP_ERR)}`,
    );
  }
  return JSON.stringify({
    command,
    exitCode: 0,
    stdout: cap(r.stdout, CAP_OK),
    stderr: cap(r.stderr, CAP_OK),
    timedOut: false,
    duration_ms: durationMs,
    cwd: abs,
  });
}

// ---------------------------------------------------------------------------
// run_in_terminal — delegates to shell_terminal (visible cmd /k console window).
// Returns the shell_terminal job JSON (including the job id; kill via
// shell_cancel / cancel_background_command).
// ---------------------------------------------------------------------------
export async function handleRunInTerminal(command: string): Promise<string> {
  return handleShellTerminal(command);
}

// ---------------------------------------------------------------------------
// run_test_command — delegates to shell_test ({command, exit_code, stdout,
// stderr, passed}; never errors on a failing test; CI=true).
// ---------------------------------------------------------------------------
export async function handleRunTestCommand(command: string): Promise<string> {
  return handleShellTest(command);
}

// ---------------------------------------------------------------------------
// run_background_command — delegates to shell_start. Job ids live in the fork's
// per-process registry (same lifetime semantics as Beledarian's per-process
// backgroundCommands Map). name is required (as in Beledarian); timeout_hours
// defaults to 10 (max 10).
// ---------------------------------------------------------------------------
export async function handleRunBackgroundCommand(
  command: string,
  name: string,
  timeoutHours?: number,
  cwd?: string,
): Promise<string> {
  return handleShellStart(command, name, timeoutHours, cwd);
}

// ---------------------------------------------------------------------------
// check_background_command — delegates to shell_check.
// ---------------------------------------------------------------------------
export async function handleCheckBackgroundCommand(id: string): Promise<string> {
  return handleShellCheck(id);
}

// ---------------------------------------------------------------------------
// cancel_background_command — delegates to shell_cancel (kills the whole tree).
// ---------------------------------------------------------------------------
export async function handleCancelBackgroundCommand(id: string): Promise<string> {
  return handleShellCancel(id);
}

// ---------------------------------------------------------------------------
// run_python — temp .py + system python (alias of shell_python, 60 s cap).
// Mirrors handleShellPython exactly (temp file in the shell-jobs dir, deleted
// in finally) with Beledarian's 60 s cap.
// ---------------------------------------------------------------------------
export async function handleRunPython(
  code: string,
  timeoutSeconds?: number,
  cwd?: string,
): Promise<string> {
  const abs = await resolveCwd(cwd);
  await ensureJobsDir();
  const file = nodePath.join(SHELL_JOBS_DIR, `py-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}.py`);
  await fsp.writeFile(file, code, "utf-8");
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), COMPAT_SYNC_TIMEOUT_SEC);
  const started = Date.now();
  try {
    const r = await runCaptured("python", [file], {
      cwd: abs,
      timeoutMs: timeout * 1000,
    });
    const durationMs = Date.now() - started;
    if (r.spawnError) {
      throw new Error(`Failed to launch python: ${r.spawnError}`);
    }
    if (r.timedOut) {
      throw new Error(
        `Process timed out after ${timeout}s.\nSTDOUT:\n${cap(r.stdout, CAP_ERR)}\nSTDERR:\n${cap(r.stderr, CAP_ERR)}`,
      );
    }
    if (r.code !== 0) {
      throw new Error(
        `Process exited with code ${r.code ?? "unknown"}.\nSTDOUT:\n${cap(r.stdout, CAP_ERR)}\nSTDERR:\n${cap(r.stderr, CAP_ERR)}`,
      );
    }
    return JSON.stringify({
      exitCode: 0,
      stdout: cap(r.stdout, CAP_OK),
      stderr: cap(r.stderr, CAP_OK),
      timedOut: false,
      duration_ms: durationMs,
    });
  } finally {
    await fsp.unlink(file).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// run_javascript — the CONFINED variant (replicates Beledarian reference
// L544-610; NOT an alias of run_javascript_free).
//
// Temp .ts written in the working directory (Beledarian's pattern, deleted in
// finally), Deno flags: --allow-read=. --allow-write=. --no-prompt --deny-net
// --deny-env --deny-sys --deny-run --deny-ffi (net/env/sys/run/ffi denied;
// no --allow-import, so external module imports are denied — "you cannot import
// external modules"). cwd defaults to the fork's shell_cwd default. Default
// timeout 5 s, max 60 s. Returns {stdout, stderr} (trimmed, per the reference).
// Non-zero exit throws the reference's error text: "Process exited with code N.
// Stderr: ...". Reuses the fork's Deno binary resolution (resolveDenoPath).
// ---------------------------------------------------------------------------
export async function handleRunJavascript(
  javascript: string,
  timeoutSeconds?: number,
): Promise<string> {
  const deno = resolveDenoPath();
  if (!deno) {
    throw new Error(
      "No Deno runtime found. Set the DENO_PATH environment variable to a deno binary, " +
        "install deno on PATH, or run this server from inside an LM Studio installation " +
        "(which bundles deno at <home>/.internal/utils/deno.exe).",
    );
  }
  const abs = await resolveCwd();
  const file = nodePath.join(abs, `temp_script_${Date.now()}.ts`);
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), COMPAT_SYNC_TIMEOUT_SEC);
  const started = Date.now();
  try {
    await fsp.writeFile(file, javascript, "utf-8");
    const r = await runCaptured(
      deno,
      [
        "run",
        "--allow-read=.",
        "--allow-write=.",
        "--no-prompt",
        "--deny-net",
        "--deny-env",
        "--deny-sys",
        "--deny-run",
        "--deny-ffi",
        file,
      ],
      {
        cwd: abs,
        timeoutMs: timeout * 1000,
        env: { ...process.env, NO_COLOR: "true" },
      },
    );
    const durationMs = Date.now() - started;
    if (r.spawnError) {
      throw new Error(`Failed to launch deno: ${r.spawnError}`);
    }
    if (r.timedOut) {
      throw new Error(
        `Process timed out after ${timeout}s.\nSTDOUT:\n${cap(r.stdout, CAP_ERR)}\nSTDERR:\n${cap(r.stderr, CAP_ERR)}`,
      );
    }
    if (r.code !== 0) {
      // Reference error text (toolsProvider.ts L594).
      throw new Error(`Process exited with code ${r.code ?? "unknown"}. Stderr: ${cap(r.stderr, CAP_ERR)}`);
    }
    return JSON.stringify({
      stdout: r.stdout.trim(),
      stderr: r.stderr.trim(),
      duration_ms: durationMs,
      cwd: abs,
    });
  } finally {
    // Always cleanup temp file, even on error (reference L606-609).
    await fsp.unlink(file).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// save_memory — STANDALONE (replicates Beledarian reference L509-542, minus
// the enable gate — the fork has no such setting).
//
// Appends "- [ISO timestamp] fact" to the memory file. Memory file path =
// env MCP_MEMORY_FILE if set, else the reference machine's workspace
// memory.md if present, else <cwd>/memory.md. If the file is missing it is
// created with a '# Long-Term Memory' header.
// Returns {success, message} on success, {error} on failure.
// ---------------------------------------------------------------------------
export function resolveMemoryFile(): string {
  const env = process.env.MCP_MEMORY_FILE;
  if (env && env.trim()) return env;
  // Reference machine's workspace memory.md (kept for back-compat); on other
  // machines the path does not exist, so fall back to the server's CWD.
  const legacy = "C:\\Users\\Gerar\\.beledarians-llm-toolbox\\workspace\\memory.md";
  if (fs.existsSync(legacy)) return legacy;
  return nodePath.join(process.cwd(), "memory.md");
}

export async function handleSaveMemory(fact: string): Promise<string> {
  const memoryFile = resolveMemoryFile();
  const timestamp = new Date().toISOString();
  const entry = `\n- [${timestamp}] ${fact}`;
  try {
    // Reference: append; on failure (e.g. missing file) create with header.
    // On POSIX the reference's append fails for a missing file and the write
    // path runs; on Windows appendFile would create the file headerless, so we
    // check existence up front to keep the '# Long-Term Memory' header on all
    // platforms.
    let exists = false;
    try {
      await fsp.access(memoryFile);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      await fsp.appendFile(memoryFile, entry, "utf-8");
      return JSON.stringify({ success: true, message: "Fact saved to memory." });
    }
    await fsp.writeFile(memoryFile, "# Long-Term Memory\n" + entry, "utf-8");
    return JSON.stringify({ success: true, message: "Fact saved to memory (new file created)." });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
