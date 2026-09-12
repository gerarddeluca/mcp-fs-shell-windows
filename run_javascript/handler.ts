// run_javascript/handler.ts — unrestricted JS/TS snippet execution (MCP filesystem fork).
//
// Runs a snippet on the Deno runtime with FULL permissions (no sandbox):
// the script may read/write anywhere the server user can reach (drive letters
// and UNC paths), use the network, read the environment, spawn processes, and
// import arbitrary modules (node:*, npm:*, https:*). This is the "free"
// counterpart to the other run_javascript tools, which confine snippets to a
// working directory with net/env/sys/run/ffi denied.
//
// Engine resolution (first hit wins; result is cached):
//   1. $DENO_PATH env var (absolute path to a deno binary)
//   2. <ancestor>/.internal/utils/deno(.exe) walking up from the server CWD
//      (LM Studio bundles deno at <home>/.internal/utils)
//   3. <user home>/.lmstudio/.internal/utils/deno(.exe)
//   4. deno on PATH
//
// Reuses the shell layer's spawn/capture machinery (runCaptured + caps).
import fsp from "fs/promises";
import fs from "fs";
import nodePath from "path";
import os from "os";
import crypto from "crypto";
import { RUN_JS_MAX_TIMEOUT_SEC } from "./schema.js";
import {
  cap,
  CAP_OK,
  CAP_ERR,
  SHELL_JOBS_DIR,
  ensureJobsDir,
  resolveCwd,
  runCaptured,
} from "../shell/handler.js";

function denoName(): string {
  return process.platform === "win32" ? "deno.exe" : "deno";
}

let cachedDenoPath: string | null | undefined;

export function resolveDenoPath(): string | null {
  if (cachedDenoPath !== undefined) return cachedDenoPath;
  let found: string | null = null;

  // 1. explicit override
  const env = process.env.DENO_PATH;
  if (env && fs.existsSync(env)) found = env;

  // 2. walk up from the server CWD: <dir>/.internal/utils/deno(.exe)
  if (!found) {
    let dir = process.cwd();
    for (let i = 0; i < 8 && !found; i++) {
      const candidate = nodePath.join(dir, ".internal", "utils", denoName());
      if (fs.existsSync(candidate)) found = candidate;
      const parent = nodePath.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  // 3. typical LM Studio user install: <home>/.lmstudio/.internal/utils/deno(.exe)
  if (!found) {
    const candidate = nodePath.join(os.homedir(), ".lmstudio", ".internal", "utils", denoName());
    if (fs.existsSync(candidate)) found = candidate;
  }

  // 4. PATH lookup
  if (!found) {
    const dirs = (process.env.PATH ?? "").split(nodePath.delimiter).filter(Boolean);
    for (const d of dirs) {
      const candidate = nodePath.join(d, denoName());
      if (fs.existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
  }

  cachedDenoPath = found;
  return found;
}

export async function handleRunJavascriptFree(
  javascript: string,
  timeoutSeconds?: number,
  cwd?: string,
): Promise<string> {
  const deno = resolveDenoPath();
  if (!deno) {
    throw new Error(
      "No Deno runtime found. Set the DENO_PATH environment variable to a deno binary, " +
        "install deno on PATH, or run this server from inside an LM Studio installation " +
        "(which bundles deno at <home>/.internal/utils/deno.exe).",
    );
  }
  const abs = await resolveCwd(cwd);
  await ensureJobsDir();
  const file = nodePath.join(SHELL_JOBS_DIR, `js-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}.ts`);
  await fsp.writeFile(file, javascript, "utf-8");
  const timeout = Math.min(Math.max(timeoutSeconds ?? 5, 0.1), RUN_JS_MAX_TIMEOUT_SEC);
  const started = Date.now();
  try {
    const r = await runCaptured(
      deno,
      [
        "run",
        "--no-prompt",
        "--allow-read",
        "--allow-write",
        "--allow-net",
        "--allow-env",
        "--allow-sys",
        "--allow-run",
        "--allow-ffi",
        "--allow-import",
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
      cwd: abs,
      deno,
    });
  } finally {
    await fsp.unlink(file).catch(() => undefined);
  }
}
