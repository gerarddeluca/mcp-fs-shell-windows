// shell/handler.ts — standalone shell tools (MCP filesystem fork).
// Windows-first (host is win32). Self-contained: node builtins + SHELL_MAX_TIMEOUT_SEC
// from ./schema.js. Design constraint: every synchronous handler must return in well
// under ~30 s (the MCP client kills longer requests with -32001); long-running work
// goes through the in-server background-job registry.
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import nodePath from "path";
import os from "os";
import crypto from "crypto";
import { SHELL_MAX_TIMEOUT_SEC } from "./schema.js";

// ---------------------------------------------------------------------------
// Shared state & helpers
// ---------------------------------------------------------------------------

export const SHELL_JOBS_DIR = nodePath.join(os.tmpdir(), "mcp-fs-shell-windows", "shell-jobs");

export interface ShellJob {
  id: string;
  name: string;
  command: string;
  cwd: string;
  pid: number | null;
  status: "running" | "completed" | "error" | "cancelled" | "timeout";
  exitCode: number | null;
  startedAt: number; // Date.now()
  endedAt: number | null;
  stdoutTail: string;
  stderrTail: string;
  logFile: string | null;
  proc: ChildProcess | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  statusPoll: ReturnType<typeof setTimeout> | null;
}

const jobs = new Map<string, ShellJob>();
let defaultShellCwd = process.cwd();

/**
 * The shell_cwd default working directory. Exposed for tools that operate on
 * "the working directory" as their context (fork equivalent of the
 * Beledarian plugin's currentWorkingDirectory), e.g. analyze_project.
 */
export function getDefaultShellCwd(): string {
  return defaultShellCwd;
}

// Best-effort startup cleanup: drop job log files older than 24 h.
try {
  const entries = fs.readdirSync(SHELL_JOBS_DIR);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    try {
      const p = nodePath.join(SHELL_JOBS_DIR, entry);
      if (fs.statSync(p).mtimeMs < cutoff) {
        fs.unlinkSync(p);
      }
    } catch {
      // ignore individual failures
    }
  }
} catch {
  // Job dir may not exist yet — that's fine.
}

/** Keep only the last `max` chars; mark truncation. */
export function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `...[truncated] ` + text.slice(-max);
}

export const CAP_OK = 100000; // cap for stdout/stderr in success payloads
export const CAP_ERR = 20000; // cap for output embedded in error messages
const TAIL = 262144; // per-stream in-memory job tail (256 KB)

function newJobId(): string {
  return `sj-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Resolve the effective working directory (param override or module default) and validate it. */
export async function resolveCwd(cwd?: string): Promise<string> {
  const abs = cwd ? nodePath.resolve(cwd) : defaultShellCwd;
  const st = await fsp.stat(abs).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new Error(`Working directory does not exist or is not a directory: ${abs}`);
  }
  return abs;
}

/**
 * Kill a process tree (Windows).
 *
 * PRIMARY: taskkill /PID <pid> /T /F — walks the LIVE process tree and
 * terminates the root plus every descendant (the actual command processes).
 * taskkill is waited for (its 'close'/'error' event) BEFORE any fallback —
 * child.kill() is never concurrent with a running taskkill, so it can never
 * destroy the root mid tree-walk and orphan descendants (the regression
 * fixed 2026-08-29: an immediate child.kill() let "cancelled" ping -n 300
 * jobs run to completion).
 * After taskkill finishes, the root is probed: child.kill() runs ONLY if the
 * root is still alive (covers a taskkill that could not finish the job).
 * Safe when the root already exited: taskkill exits non-zero ("not found"),
 * the probe says dead, no fallback. Every EventEmitter path is handled (no
 * uncaught 'error' events); killTree is fire-and-forget — callers never block.
 */
/**
 * Does a Windows process with this PID currently exist? (probe, no signal —
 * process.kill(pid, 0) only opens the process handle on win32.)
 */
function rootAlive(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      process.kill(pid, 0);
      resolve(true);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      resolve(code !== "ESRCH"); // EPERM etc. = exists but not ours
    }
  });
}

function killTree(pid: number | null, child?: ChildProcess | null): void {
  if (pid === null || pid === undefined) {
    try {
      child?.kill();
    } catch {
      // already dead
    }
    return;
  }
  let taskkillProc: ChildProcess;
  try {
    // stdout piped (not "ignore") so the close event reliably signals that
    // taskkill has FINISHED before we consider any fallback.
    taskkillProc = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    try {
      child?.kill();
    } catch {
      // already dead
    }
    return;
  }
  let done = false;
  const guard = setTimeout(() => {
    if (!done) {
      done = true;
      void rootAlive(pid).then((alive) => {
        if (alive) {
          try {
            child?.kill();
          } catch {
            // already dead
          }
        }
      });
    }
  }, 15000);
  guard.unref();
  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    // taskkill has fully exited — no race possible here. Fall back only if
    // the root somehow survived it (e.g. taskkill could not reach the tree).
    void rootAlive(pid).then((alive) => {
      if (alive) {
        try {
          child?.kill();
        } catch {
          // already dead
        }
      }
    });
  };
  // Drain taskkill's output so its pipes never apply backpressure.
  taskkillProc.stdout?.resume();
  taskkillProc.stderr?.resume();
  taskkillProc.on("error", finish);
  taskkillProc.on("close", finish);
  taskkillProc.unref();
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
  return cleaned || "job";
}

/**
 * Builds a line-oriented log feeder: buffers chunks per stream, emits COMPLETE lines
 * prefixed with [OUT] / [ERR], and carries the partial trailing line forward.
 */
function makeLineFeeder(logStream: fs.WriteStream): {
  feed: (stream: "OUT" | "ERR", chunk: string) => void;
  flush: () => void;
} {
  const state = { outPartial: "", errPartial: "" };
  const feed = (stream: "OUT" | "ERR", chunk: string): void => {
    const key = stream === "OUT" ? "outPartial" : "errPartial";
    const buffer = state[key] + chunk;
    const lines = buffer.split("\n");
    state[key] = lines.pop() ?? "";
    const complete = lines.map((l) => `[${stream}] ${l}\n`).join("");
    if (complete) logStream.write(complete);
  };
  const flush = (): void => {
    if (state.outPartial) {
      logStream.write(`[OUT] ${state.outPartial}\n`);
      state.outPartial = "";
    }
    if (state.errPartial) {
      logStream.write(`[ERR] ${state.errPartial}\n`);
      state.errPartial = "";
    }
  };
  return { feed, flush };
}

export async function ensureJobsDir(): Promise<void> {
  await fsp.mkdir(SHELL_JOBS_DIR, { recursive: true }).catch(() => undefined);
}

interface CaptureResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  spawnError?: string;
}

/**
 * Spawn a process, capture stdout/stderr (utf-8), enforce a timeout via killTree.
 * Resolves (never rejects) with the outcome; spawn failures are reported in spawnError.
 */
export async function runCaptured(
  exe: string,
  args: string[],
  opts: { cwd: string; input?: string; timeoutMs: number; env?: NodeJS.ProcessEnv; verbatim?: boolean },
): Promise<CaptureResult> {
  const result: CaptureResult = { stdout: "", stderr: "", code: null, timedOut: false };
  await new Promise<void>((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(exe, args, {
        cwd: opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: opts.env,
        // verbatim: deliver the user command to cmd.exe byte-for-byte. Node's
        // default win32 argv quoting backslash-escapes embedded quotes, which
        // breaks ordinary cmd syntax (wmic where "...", tasklist /fi "...",
        // paths with spaces) at the Node -> CreateProcess boundary.
        windowsVerbatimArguments: opts.verbatim ?? false,
      });
    } catch (err) {
      result.spawnError = err instanceof Error ? err.message : String(err);
      resolve();
      return;
    }
    const p = proc;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    p.stdout?.setEncoding("utf-8");
    p.stderr?.setEncoding("utf-8");
    p.stdout?.on("data", (d: Buffer) => {
      result.stdout += d.toString("utf-8");
    });
    p.stderr?.on("data", (d: Buffer) => {
      result.stderr += d.toString("utf-8");
    });
    p.on("close", (code: number | null) => {
      result.code = code;
      finish();
    });
    p.on("error", (err: Error) => {
      result.spawnError = err.message;
      finish();
    });
    if (opts.input) {
      p.stdin?.write(opts.input);
    }
    // Always close stdin so non-interactive commands cannot hang waiting for input.
    p.stdin?.end();
    timer = setTimeout(() => {
      result.timedOut = true;
      killTree(p.pid ?? null, p);
    }, opts.timeoutMs);
  });
  return result;
}

// ---------------------------------------------------------------------------
// shell_run — bounded synchronous execution
// ---------------------------------------------------------------------------

export async function handleShellRun(
  command: string,
  input?: string,
  timeoutSeconds?: number,
  cwd?: string,
): Promise<string> {
  const abs = await resolveCwd(cwd);
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), SHELL_MAX_TIMEOUT_SEC);
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
// shell_test — test wrapper (CI=true, fixed max timeout, never errors on outcomes)
// ---------------------------------------------------------------------------

export async function handleShellTest(command: string, cwd?: string): Promise<string> {
  const abs = await resolveCwd(cwd);
  const started = Date.now();
  const r = await runCaptured("cmd.exe", ["/d", "/c", command], {
    cwd: abs,
    timeoutMs: SHELL_MAX_TIMEOUT_SEC * 1000,
    env: { ...process.env, CI: "true" },
    verbatim: true,
  });
  const durationMs = Date.now() - started;
  if (r.spawnError) {
    throw new Error(`Failed to launch test command: ${r.spawnError}`);
  }
  const code = r.code;
  return JSON.stringify({
    command,
    exit_code: code,
    stdout: cap(r.stdout, CAP_OK),
    stderr: cap(r.stderr, CAP_OK),
    passed: code === 0 && !r.timedOut,
    timedOut: r.timedOut,
    duration_ms: durationMs,
  });
}

// ---------------------------------------------------------------------------
// shell_start — background job (registry + log file + 256 KB tails + auto-kill)
// ---------------------------------------------------------------------------

export async function handleShellStart(
  command: string,
  name?: string,
  timeoutHours?: number,
  cwd?: string,
): Promise<string> {
  const abs = await resolveCwd(cwd);
  await ensureJobsDir();
  const id = newJobId();
  const jobName = name && name.trim() ? name : "shelljob";
  const logFile = nodePath.join(SHELL_JOBS_DIR, `${id}-${sanitizeName(jobName)}.log`);

  const job: ShellJob = {
    id,
    name: jobName,
    command,
    cwd: abs,
    pid: null,
    status: "running",
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    stdoutTail: "",
    stderrTail: "",
    logFile,
    proc: null,
    timeoutHandle: null,
    statusPoll: null,
  };

  let logStream: fs.WriteStream | null = null;
  try {
    logStream = fs.createWriteStream(logFile);
    logStream.write(`# ${new Date().toISOString()} | ${command} | cwd=${abs}\n`);
  } catch {
    // Log file is best-effort; the job still runs without it.
    job.logFile = null;
  }

  const timeoutHoursEff = Math.min(Math.max(timeoutHours ?? 10, 0.001), 10);
  try {
    const proc = spawn("cmd.exe", ["/d", "/c", command], {
      cwd: abs,
      stdio: ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments: true,
    });
    job.proc = proc;
    job.pid = proc.pid ?? null;

    const feeder = logStream ? makeLineFeeder(logStream) : null;
    const stream = logStream;
    proc.stdout?.on("data", (d: Buffer) => {
      const text = d.toString("utf-8");
      job.stdoutTail += text;
      if (job.stdoutTail.length > TAIL) job.stdoutTail = job.stdoutTail.slice(-TAIL);
      feeder?.feed("OUT", text);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      const text = d.toString("utf-8");
      job.stderrTail += text;
      if (job.stderrTail.length > TAIL) job.stderrTail = job.stderrTail.slice(-TAIL);
      feeder?.feed("ERR", text);
    });

    proc.on("close", (code: number | null) => {
      job.status = job.status === "cancelled" || job.status === "timeout" ? job.status : "completed";
      job.exitCode = code;
      job.endedAt = Date.now();
      if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
      try {
        feeder?.flush();
        stream?.end();
      } catch {
        // best-effort
      }
    });
    proc.on("error", (err: Error) => {
      if (job.status === "running") {
        job.status = "error";
        job.stderrTail += `\nError: ${err.message}`;
        job.endedAt = Date.now();
      }
    });

    const t = setTimeout(() => {
      if (job.status === "running") {
        job.status = "timeout";
        job.endedAt = Date.now();
        killTree(job.pid, job.proc);
      }
    }, timeoutHoursEff * 3600 * 1000);
    t.unref(); // never keep the MCP server alive solely for this timer
    job.timeoutHandle = t;
  } catch (err) {
    job.status = "error";
    job.stderrTail += `\nError: ${err instanceof Error ? err.message : String(err)}`;
    job.endedAt = Date.now();
    try {
      logStream?.end();
    } catch {
      // best-effort
    }
  }

  jobs.set(id, job);
  // Wait briefly to catch immediate failures (parity with Beledarian's run_background_command).
  await new Promise((resolve) => setTimeout(resolve, 500));

  return JSON.stringify({
    id,
    name: job.name,
    pid: job.pid,
    status: job.status,
    logFile: job.logFile,
    message: `Job started. Use shell_check with ID ${id} to poll; shell_cancel to kill.`,
  });
}

// ---------------------------------------------------------------------------
// shell_check — job status + output tails
// ---------------------------------------------------------------------------

export async function handleShellCheck(id: string): Promise<string> {
  const job = jobs.get(id);
  if (!job) {
    const active = [...jobs.keys()].join(", ") || "(none)";
    throw new Error(
      `No shell job found with ID ${id}. Active jobs: ${active}. (Jobs live in the MCP server's memory and are lost when it restarts.)`,
    );
  }
  return JSON.stringify({
    id: job.id,
    name: job.name,
    status: job.status,
    exitCode: job.exitCode,
    duration_seconds: Math.floor((Date.now() - job.startedAt) / 1000),
    stdout_tail: job.stdoutTail.slice(-4000),
    stderr_tail: job.stderrTail.slice(-4000),
    logFile: job.logFile,
  });
}

// ---------------------------------------------------------------------------
// shell_cancel — kill a job (whole process tree)
// ---------------------------------------------------------------------------

export async function handleShellCancel(id: string): Promise<string> {
  const job = jobs.get(id);
  if (!job) {
    const active = [...jobs.keys()].join(", ") || "(none)";
    throw new Error(
      `No shell job found with ID ${id}. Active jobs: ${active}. (Jobs live in the MCP server's memory and are lost when it restarts.)`,
    );
  }
  if (job.status !== "running") {
    return JSON.stringify({ id: job.id, status: job.status, message: `Job is already ${job.status}.` });
  }
  job.status = "cancelled";
  job.endedAt = Date.now();
  if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
  job.timeoutHandle = null;
  killTree(job.pid, job.proc);
  return JSON.stringify({ id: job.id, status: "cancelled", message: "Job killed." });
}

// ---------------------------------------------------------------------------
// shell_terminal — separate, persistent, interactive cmd /k console window
// ---------------------------------------------------------------------------

/**
 * PID-liveness probe for terminal windows (tracked by PID rather than by
 * process handle: the window is a separate process tree started via
 * Start-Process). Spawned directly (no shell) so the /fi filter string is a
 * single argv element — no quote mangling. NOTE: this build of tasklist does
 * NOT support compound `AND` filters — the value token swallows the rest of
 * the line (verified 2026-08-29: `PID eq <n> AND ImageName eq cmd.exe`
 * matches nothing), so we filter by PID only and verify the matched row's
 * image name is cmd.exe (mitigates PID reuse). tasklist error output =
 * unknown → assume alive (conservative; the next poll retries).
 */
function terminalPidAlive(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn("tasklist", ["/fi", `PID eq ${pid}`], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      resolve(true); // conservative: assume still alive
      return;
    }
    let out = "";
    let finished = false;
    const finish = (alive: boolean): void => {
      if (finished) return;
      finished = true;
      resolve(alive);
    };
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString("utf-8");
    });
    proc.stderr?.resume();
    proc.on("error", () => finish(true));
    proc.on("close", () => {
      const text = out.trim();
      if (text.startsWith("ERROR")) {
        finish(true); // tasklist itself failed; assume alive, retry next poll
        return;
      }
      if (text.includes("No tasks are running")) {
        finish(false);
        return;
      }
      for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (line.includes(String(pid)) && /^cmd\.exe/i.test(line)) {
          finish(true);
          return;
        }
      }
      finish(false);
    });
    const guard = setTimeout(() => finish(true), 10000);
    guard.unref();
  });
}

async function cleanupTerminalFiles(id: string): Promise<void> {
  for (const f of [
    nodePath.join(SHELL_JOBS_DIR, `${id}.cmd`),
    nodePath.join(SHELL_JOBS_DIR, `${id}.ps1`),
  ]) {
    await fsp.unlink(f).catch(() => undefined);
  }
}

export async function handleShellTerminal(command: string, cwd?: string): Promise<string> {
  const abs = await resolveCwd(cwd);
  await ensureJobsDir();
  const id = newJobId();
  const batchFile = nodePath.join(SHELL_JOBS_DIR, `${id}.cmd`);
  const launcherFile = nodePath.join(SHELL_JOBS_DIR, `${id}.ps1`);

  // The user command runs as a batch file inside a NEW, separate console
  // window. Start-Process gives that window a real console (the user can
  // type into it) and the window is NOT attached to this MCP server's
  // stdio, so the JSON-RPC transport is untouched. The launcher prints the
  // window's PID for tracking.
  await fsp.writeFile(batchFile, command, "utf-8");
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    `$p = Start-Process cmd -ArgumentList '/d', '/k', '${batchFile}' -WorkingDirectory '${abs}' -PassThru`,
    "$p.Id",
  ].join("\n");
  await fsp.writeFile(launcherFile, ps, "utf-8");

  const r = await runCaptured(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", launcherFile],
    { cwd: abs, timeoutMs: 20000 },
  );
  const pidMatch = r.stdout.match(/\d+/);
  if (r.spawnError || r.timedOut || !pidMatch) {
    await cleanupTerminalFiles(id);
    const detail = r.spawnError
      ? `: ${r.spawnError}`
      : r.timedOut
        ? " (launcher timed out after 20s)"
        : ` (no PID in output: ${cap(r.stdout + r.stderr, 2000)})`;
    throw new Error(`Failed to launch terminal${detail}`);
  }
  const pid = parseInt(pidMatch[0], 10);

  const job: ShellJob = {
    id,
    name: "terminal",
    command,
    cwd: abs,
    pid,
    status: "running",
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    stdoutTail: "",
    stderrTail: "",
    logFile: null,
    proc: null, // the window is a separate process tree; tracked by PID
    timeoutHandle: null,
    statusPoll: null,
  };
  jobs.set(id, job);

  // Lifecycle: no process handle to watch, so poll PID liveness every 5 s.
  // When the window goes away (user closed it, or the tree was cancelled),
  // finalize the job and clean up the helper files.
  const finalize = (): void => {
    if (job.statusPoll) clearTimeout(job.statusPoll);
    job.statusPoll = null;
    if (job.status === "running") {
      job.status = "completed";
      job.exitCode = 0; // window closed normally by the user
    }
    if (job.endedAt === null) job.endedAt = Date.now();
    void cleanupTerminalFiles(id);
  };
  const poll = (): void => {
    if (job.statusPoll) clearTimeout(job.statusPoll);
    const active = job.status === "running" || job.status === "cancelled" || job.status === "timeout";
    if (!active) {
      job.statusPoll = null;
      return;
    }
    void terminalPidAlive(pid).then((alive) => {
      if (!alive) {
        finalize();
      } else {
        job.statusPoll = setTimeout(poll, 5000);
        job.statusPoll.unref();
      }
    });
  };
  job.statusPoll = setTimeout(poll, 5000);
  job.statusPoll.unref();

  return JSON.stringify({
    id,
    pid,
    status: "running",
    logFile: null,
    message: `Visible cmd.exe window launched (separate interactive console, cmd /k). The window persists after the command finishes; use shell_cancel with ID ${id} to close it.`,
  });
}

// ---------------------------------------------------------------------------
// shell_python — temp .py + system python
// ---------------------------------------------------------------------------

export async function handleShellPython(
  code: string,
  timeoutSeconds?: number,
  cwd?: string,
): Promise<string> {
  const abs = await resolveCwd(cwd);
  await ensureJobsDir();
  const file = nodePath.join(SHELL_JOBS_DIR, `py-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}.py`);
  await fsp.writeFile(file, code, "utf-8");
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), SHELL_MAX_TIMEOUT_SEC);
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
// shell_cwd — get/set the default working directory for shell_* tools
// ---------------------------------------------------------------------------

export async function handleShellCwd(dir?: string): Promise<string> {
  if (!dir) {
    return JSON.stringify({ cwd: defaultShellCwd });
  }
  const abs = nodePath.resolve(defaultShellCwd, dir);
  const st = await fsp.stat(abs).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new Error(`Path is not a directory: ${abs}`);
  }
  const previous = defaultShellCwd;
  defaultShellCwd = abs;
  return JSON.stringify({ previous_directory: previous, current_directory: abs });
}
