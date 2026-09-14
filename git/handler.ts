// git/handler.ts — git CLI wrappers for the 6 git_* tools (MCP filesystem fork).
//
// Design: spawn the `git` binary directly (git is on PATH; no new dependency).
// Every tool operates against the repo at the server process's current working
// directory (process.cwd()) — the same "current working directory context" the
// shell tools use — and takes NO working-directory parameter (matching the
// reference Beledarian tools). Path arguments are resolved relative to that
// directory. All argument values (messages, branch names, file paths) are passed
// as individual argv elements (no shell), so quotes / Unicode / special
// characters pass through verbatim.
//
// Return shape mirrors the reference implementation: each handler returns a JSON
// text string carrying the reference's fields ({error} on failure, {diff},
// {history}, {success, ...}) instead of throwing, so a working directory that is
// not inside a git repository yields a clear error string rather than a crash.
import { spawn, type ChildProcess } from "child_process";
import nodePath from "path";

interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run `git <args>` with the given cwd. Never rejects; spawn failures resolve with code -1. */
function runGit(args: string[], cwd: string): Promise<GitRun> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn("git", args, { cwd });
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
      // e.g. ENOENT when the git binary cannot be found on PATH
      stderr += (stderr ? "\n" : "") + (e.message || String(e));
      finish(-1);
    });
    child.on("close", (code) => finish(code === null ? -1 : code));
  });
}

/** JSON error text matching the reference shape: {error: "Git <what> failed: <detail>"}. */
function failText(out: GitRun, what: string): string {
  const detail = out.stderr.trim() || out.stdout.trim() || `git exited with code ${out.code}`;
  return JSON.stringify({ error: `Git ${what} failed: ${detail}` });
}

/** The repo context for all git_* tools: the server process's current working directory. */
function gitCwd(): string {
  return process.cwd();
}

export async function handleGitStatus(): Promise<string> {
  const dir = gitCwd();
  const st = await runGit(["status", "--porcelain=v1", "--branch"], dir);
  if (st.code !== 0) {
    return failText(st, "status");
  }
  const lines = st.stdout.replace(/\r/g, "").split("\n");
  let current: string | null = null;
  let tracking: string | null = null;
  let ahead = 0;
  let behind = 0;
  const staged: string[] = [];
  const notStaged: string[] = [];
  const untracked: string[] = [];
  const files: Array<{ path: string; index: string; working_dir: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.startsWith("## ")) {
      // Header: "## branch", "## branch...upstream", "## branch...upstream [ahead 1, behind 2]",
      // or "## HEAD (no branch)" (detached HEAD).
      let rest = line.slice(3);
      const bracket = / \[([^\]]*)\]$/.exec(rest);
      if (bracket) {
        const am = /ahead (\d+)/.exec(bracket[1]);
        const bm = /behind (\d+)/.exec(bracket[1]);
        if (am) ahead = parseInt(am[1], 10);
        if (bm) behind = parseInt(bm[1], 10);
        rest = rest.slice(0, rest.length - bracket[0].length);
      }
      const sep = rest.indexOf("...");
      if (sep >= 0) {
        const left = rest.slice(0, sep);
        current = left === "HEAD" ? null : left;
        tracking = rest.slice(sep + 3) || null;
      } else if (rest.startsWith("HEAD (")) {
        current = null;
        tracking = null;
      } else {
        current = rest || null;
        tracking = null;
      }
      continue;
    }
    if (!line) continue;
    const index = line[0];
    const working = line[1];
    let p = line.slice(3);
    // Rename/copy entries: "R  old -> new" / "C  old -> new" — report the destination.
    if (index === "R" || index === "C") {
      const arrow = p.indexOf(" -> ");
      if (arrow >= 0) p = p.slice(arrow + 4);
    }
    files.push({ path: p, index, working_dir: working });
    if (index === "?" && working === "?") {
      untracked.push(p);
    } else {
      if (index !== " " && index !== "?") staged.push(p);
      if (working !== " " && working !== "?") notStaged.push(p);
    }
  }

  const isClean = staged.length === 0 && notStaged.length === 0 && untracked.length === 0;
  return JSON.stringify({ current, tracking, ahead, behind, isClean, staged, notStaged, untracked, files });
}

export async function handleGitDiff(file_path?: string, cached?: boolean): Promise<string> {
  const dir = gitCwd();
  const args = ["diff"];
  if (cached) args.push("--cached");
  if (file_path) {
    args.push("--", nodePath.resolve(dir, file_path));
  }
  const d = await runGit(args, dir);
  if (d.code !== 0) {
    return failText(d, "diff");
  }
  const text = d.stdout.replace(/\n$/, "");
  return JSON.stringify({ diff: text.length > 0 ? text : "No changes." });
}

export async function handleGitCommit(message: string): Promise<string> {
  const dir = gitCwd();
  // Pre-image stat of what is staged (mirrors the reference's {changed, insertions, deletions} summary).
  const summary = { changed: 0, insertions: 0, deletions: 0 };
  const pre = await runGit(["diff", "--cached", "--shortstat"], dir);
  if (pre.code === 0 && pre.stdout.trim()) {
    const mf = /(\d+) files? changed/.exec(pre.stdout);
    if (mf) summary.changed = parseInt(mf[1], 10);
    const mi = /(\d+) insertions?\(\+\)/.exec(pre.stdout);
    if (mi) summary.insertions = parseInt(mi[1], 10);
    const md = /(\d+) deletions?\(-\)/.exec(pre.stdout);
    if (md) summary.deletions = parseInt(md[1], 10);
  }
  // Standard git behavior: commit only what is staged.
  const c = await runGit(["commit", "-m", message], dir);
  if (c.code !== 0) {
    return failText(c, "commit");
  }
  return JSON.stringify({ success: true, summary });
}

export async function handleGitLog(max_count?: number): Promise<string> {
  const dir = gitCwd();
  const n =
    typeof max_count === "number" && Number.isFinite(max_count) && max_count > 0
      ? Math.floor(max_count)
      : 10;
  const l = await runGit(["log", "-n", String(n), "--pretty=format:%h %s (%an, %ar)"], dir);
  if (l.code !== 0) {
    return failText(l, "log");
  }
  const history = l.stdout
    .split("\n")
    .map((s) => s.trimEnd())
    .filter((s) => s.length > 0);
  return JSON.stringify({ history });
}

export async function handleGitAdd(paths?: string[]): Promise<string> {
  const dir = gitCwd();
  const args =
    paths && paths.length > 0
      ? ["add", "--", ...paths.map((p) => nodePath.resolve(dir, p))]
      : ["add", "."];
  const a = await runGit(args, dir);
  if (a.code !== 0) {
    return failText(a, "add");
  }
  return JSON.stringify({ success: true, message: "Files staged successfully." });
}

export async function handleGitCheckout(branch_name: string, create_new?: boolean): Promise<string> {
  const dir = gitCwd();
  const args = create_new ? ["checkout", "-b", branch_name] : ["checkout", branch_name];
  const c = await runGit(args, dir);
  if (c.code !== 0) {
    return failText(c, "checkout");
  }
  return JSON.stringify({ success: true, message: `Switched to branch '${branch_name}'.` });
}
