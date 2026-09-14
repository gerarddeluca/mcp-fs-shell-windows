// gh/handler.ts — gh CLI wrappers for the 8 gh_* tools (MCP filesystem fork).
//
// Design: spawn the `gh` binary directly (no new dependency; `git push` for
// gh_push spawns the git CLI). Every tool operates against the repo at the
// server process's current working directory (process.cwd()) — the same
// "current working directory context" the git/shell tools use — and takes NO
// working-directory parameter (matching the reference Beledarian tools: the
// reference's gh spawns inherit the plugin process cwd, and gh itself resolves
// the repo from that cwd's git remote). All argument values (titles, bodies,
// labels, branch names, issue/PR numbers) are passed as individual argv
// elements (no shell), so quotes / Unicode / special characters pass through
// verbatim. Long issue/PR bodies are written to a temp file in the working
// directory and passed via --body-file (mirroring the reference); the temp
// file is always removed afterwards.
//
// gh binary resolution (port of the reference's checkGhInstalled, with a
// documented fallback): PATH lookup via `where gh` (win32) / `which gh` first;
// if gh is not on the server process's PATH, fall back to the known portable
// install <home>/tools/gh/bin/gh.exe (this machine's layout — gh 2.99.0,
// authenticated to github.com). If neither is found, the reference's
// "not installed" error string is returned.
//
// gh_auth: runs `gh auth status`; on failure it opens a detached terminal
// window (cmd /k) for interactive `gh auth login --git-protocol=https` exactly
// as the reference does — spawned with {detached: true, stdio: "ignore"} so it
// survives the MCP call returning, using the RESOLVED gh path so the window
// works even when gh is not on the inherited PATH. The window persists for the
// user (cmd /k) and can be closed manually.
//
// Return shape mirrors the reference implementation: each handler returns a JSON
// text string carrying the reference's fields ({success, ...} / {error} /
// {issues} / {pull_requests} / {comments} / {diff} / raw_output) instead of
// throwing, so a missing gh, a bad remote, or a bad branch yields a clear
// structured error string rather than a crash or hang.
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import nodeOs from "os";
import nodePath from "path";

interface CmdRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run `<bin> <args>` with the given cwd. Never rejects; spawn failures resolve with code -1. */
function runCmd(bin: string, args: string[], cwd: string): Promise<CmdRun> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { cwd });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    };
    if (child.stdout) {
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
    }
    child.on("error", (e: Error) => {
      // e.g. ENOENT when the binary cannot be found
      stderr += (stderr ? "\n" : "") + (e.message || String(e));
      finish(-1);
    });
    child.on("close", (code) => finish(code === null ? -1 : code));
  });
}

/** Run a shell one-liner (e.g. `where gh`). Never rejects. */
function runShellLine(cmd: string): Promise<CmdRun> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(cmd, [], { shell: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    };
    if (child.stdout) {
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
    }
    child.on("error", (e: Error) => {
      stderr += (stderr ? "\n" : "") + (e.message || String(e));
      finish(-1);
    });
    child.on("close", (code) => finish(code === null ? -1 : code));
  });
}

const GH_NOT_INSTALLED =
  "GitHub CLI ('gh') is not installed. Please ask the user to install it from https://cli.github.com/";

/** Absolute path of gh on the PATH (first hit of `where gh` / `which gh`), or null. */
async function findGhOnPath(): Promise<string | null> {
  const r = await runShellLine(process.platform === "win32" ? "where gh" : "which gh");
  if (!r.stdout.trim()) return null;
  const first = r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  if (!first) return null;
  try {
    if (fs.existsSync(first)) return first;
  } catch {
    // fall through
  }
  return null;
}

/** Known portable-install locations, checked in order (documented fallback). */
function findGhKnownPaths(): string | null {
  const home = nodeOs.homedir();
  const candidates = [nodePath.join(home, "tools", "gh", "bin", "gh.exe")];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

/** Resolve the gh executable (absolute path): PATH first, then known portable install; null if absent. */
async function resolveGh(): Promise<string | null> {
  const onPath = await findGhOnPath();
  if (onPath) return onPath;
  return findGhKnownPaths();
}

/** The repo context for all gh_* tools: the server process's current working directory. */
function ghCwd(): string {
  return process.cwd();
}

/** Detail text for a non-zero exit: stderr first, then stdout, then the exit code. */
function detail(out: CmdRun): string {
  return out.stderr.trim() || out.stdout.trim() || `gh exited with code ${out.code}`;
}

// ---------------------------------------------------------------- gh_auth

export async function handleGhAuth(): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  try {
    const st = await runCmd(ghBin, ["auth", "status"], dir);
    if (st.code === 0) {
      return JSON.stringify({ success: true, message: "Already authenticated with GitHub." });
    }
    // Not authenticated: open a detached terminal window for interactive login,
    // exactly as the reference does. The window is spawned detached with ignored
    // stdio so it outlives this call; cmd /k keeps it open for the user.
    // The resolved absolute gh path is used so the window works even when gh is
    // not on the server process's PATH.
    const escapedDir = dir.replace(/"/g, '""');
    const shellCommand = `start "" /D "${escapedDir}" cmd.exe /k "${ghBin} auth login --git-protocol=https & exit"`;
    try {
      spawn("cmd.exe", ["/c", shellCommand], { detached: true, stdio: "ignore", cwd: dir });
    } catch (e) {
      return JSON.stringify({
        error: `Auth check failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    return JSON.stringify({
      success: true,
      message: "Opened a terminal window for GitHub authentication. Please sign in there.",
    });
  } catch (e) {
    return JSON.stringify({ error: `Auth check failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ----------------------------------------------------------- gh_create_issue

export async function handleGhCreateIssue(
  title: string,
  body?: string,
  labels?: string[]
): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  try {
    let tempFilePath = "";
    const ghArgs = ["issue", "create", "--title", title];
    if (body) {
      tempFilePath = nodePath.join(dir, `gh_issue_body_${Date.now()}.md`);
      fs.writeFileSync(tempFilePath, body, "utf-8");
      ghArgs.push("--body-file", tempFilePath);
    }
    if (labels) {
      for (const label of labels) {
        ghArgs.push("-l", label);
      }
    }

    const out = await runCmd(ghBin, ghArgs, dir);

    if (tempFilePath) {
      try {
        fs.rmSync(tempFilePath, { force: true });
      } catch {
        // best-effort cleanup
      }
    }

    if (out.code === 0) return JSON.stringify({ success: true, url: out.stdout.trim() });
    return JSON.stringify({ error: `Failed to create issue: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `Create issue failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ------------------------------------------------------------ gh_list_issues

export async function handleGhListIssues(
  state?: "open" | "closed",
  labels?: string[],
  limit?: number
): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  const st = state ?? "open";
  const lim =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 1
      ? Math.min(50, Math.floor(limit))
      : 10;

  try {
    const ghArgs = [
      "issue",
      "list",
      "--state",
      st,
      "--limit",
      String(lim),
      "--json",
      "number,title,state,url,labels",
    ];
    if (labels) {
      for (const label of labels) {
        ghArgs.push("-l", label);
      }
    }

    const out = await runCmd(ghBin, ghArgs, dir);

    if (out.code === 0) {
      try {
        return JSON.stringify({ issues: JSON.parse(out.stdout) });
      } catch {
        return JSON.stringify({ error: "Failed to parse issue list output" });
      }
    }
    return JSON.stringify({ error: `List issues failed: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `List issues failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ---------------------------------------------------------- gh_view_comments

export async function handleGhViewComments(
  number: number,
  type?: "issue" | "pr"
): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  try {
    // Fallback to standard gh command for reliable JSON parsing of comments
    const ghArgs =
      type === "pr"
        ? ["pr", "view", String(number), "--json", "comments"]
        : ["issue", "view", String(number), "--json", "comments"];

    const out = await runCmd(ghBin, ghArgs, dir);

    if (out.code === 0) {
      try {
        const data = JSON.parse(out.stdout);
        return JSON.stringify({ comments: data.comments || [] });
      } catch {
        return JSON.stringify({ raw_output: out.stdout });
      }
    }
    return JSON.stringify({ error: `View comments failed: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `View comments failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ------------------------------------------------------------- gh_create_pr

export async function handleGhCreatePr(
  title: string,
  body: string | undefined,
  head_branch: string,
  base_branch?: string
): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  const base = base_branch || "main";

  try {
    let tempFilePath = "";
    const ghArgs = ["pr", "create", "--title", title, "--head", head_branch, "--base", base];

    if (body) {
      tempFilePath = nodePath.join(dir, `gh_pr_body_${Date.now()}.md`);
      fs.writeFileSync(tempFilePath, body, "utf-8");
      ghArgs.push("--body-file", tempFilePath);
    }

    const out = await runCmd(ghBin, ghArgs, dir);

    if (tempFilePath) {
      try {
        fs.rmSync(tempFilePath, { force: true });
      } catch {
        // best-effort cleanup
      }
    }

    if (out.code === 0) return JSON.stringify({ success: true, url: out.stdout.trim() });
    return JSON.stringify({ error: `Failed to create PR: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `Create PR failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// -------------------------------------------------------------- gh_list_prs

export async function handleGhListPrs(state?: "open" | "closed", limit?: number): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  const st = state ?? "open";
  const lim =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 1
      ? Math.min(50, Math.floor(limit))
      : 10;

  try {
    const ghArgs = [
      "pr",
      "list",
      "--state",
      st,
      "--limit",
      String(lim),
      "--json",
      "number,title,state,url,headRefName,baseRefName",
    ];

    const out = await runCmd(ghBin, ghArgs, dir);

    if (out.code === 0) {
      try {
        return JSON.stringify({ pull_requests: JSON.parse(out.stdout) });
      } catch {
        return JSON.stringify({ error: "Failed to parse PR list output" });
      }
    }
    return JSON.stringify({ error: `List PRs failed: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `List PRs failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ---------------------------------------------------------- gh_view_pr_diff

export async function handleGhViewPrDiff(number: number): Promise<string> {
  const dir = ghCwd();
  const ghBin = await resolveGh();
  if (!ghBin) return JSON.stringify({ error: GH_NOT_INSTALLED });

  try {
    const out = await runCmd(ghBin, ["pr", "diff", String(number)], dir);

    if (out.code === 0) {
      return JSON.stringify({
        diff: out.stdout.substring(0, 50000) + (out.stdout.length > 50000 ? "\n... (truncated)" : ""),
      });
    }
    return JSON.stringify({ error: `Fetch PR diff failed: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `Fetch PR diff failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ----------------------------------------------------------------- gh_push

export async function handleGhPush(branch?: string): Promise<string> {
  const dir = ghCwd();

  try {
    const gitArgs = ["push", "origin"];
    if (branch) gitArgs.push(branch);

    const out = await runCmd("git", gitArgs, dir);

    if (out.code === 0) return JSON.stringify({ success: true, message: "Pushed successfully." });
    return JSON.stringify({ error: `Git push failed: ${detail(out)}` });
  } catch (e) {
    return JSON.stringify({ error: `Git push failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}
