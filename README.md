# mcp-fs-shell-windows — filesystem + standalone Windows shell MCP server

A Windows-first MCP server that gives AI clients **comprehensive filesystem access** (batched read/write/search/patch across your chosen drives and UNC shares) plus **reliable local shell execution** (synchronous, background, and interactive) — in a single Node.js process with no client-side permission toggles.

Heavily extended fork of [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended), which itself extends the official [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem). Developed and tested primarily on **Windows**: drive-letter roots (`C:\`, `D:\`) and UNC network-share roots (`\\server\\share`) are first-class, and the shell tools run commands through `cmd.exe` byte-for-byte.

**npm:** [mcp-fs-shell-windows](https://www.npmjs.com/package/mcp-fs-shell-windows) · **Source:** [gerarddeluca/mcp-fs-shell-windows](https://github.com/gerarddeluca/mcp-fs-shell-windows)

## Provenance

| Layer | Source |
|---|---|
| Official base | `@modelcontextprotocol/server-filesystem` (Anthropic, PBC; MIT) |
| Base fork | [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended) @ `b6c317a` (MIT) |
| This fork | v0.2.1 tool parity + `transfer_files` rename, robustness patches, 8 shell tools (v0.2.2), verbatim argv (v0.2.4), `launch_file` launcher (v0.2.7), raw-byte access + `dir_diff` + text encodings (v0.2.9–v0.2.11), `wait_for_file` (v0.2.12), `replace_regex` (v0.2.14), reparse-point & long-path hardening (v0.2.15–v0.2.16), Recycle-Bin deletes (v0.2.17), `create_link` (v0.2.18), `run_javascript_free` unrestricted code execution (v0.2.20), 6 git tools (v0.2.21), 8 GitHub tools (v0.2.22) — see [Differences](#differences-from-the-base-fork) |

## Features

- **30 filesystem tools** — batched read/write/append/delete (including raw-byte access, per-file text encodings, Recycle-Bin deletes, and link creation), move/copy, line-number patching, search (name / glob / regex / fuzzy / wait-for-file), in-place regex replacement, tree, counts, checksums, file and directory diffs, exact-match text editing. Confined to the allowed directories passed on the command line.
- **8 shell tools** — synchronous, background, and interactive command execution implemented *inside the MCP server process*: no client-side permission toggles, survives client restarts, works with any MCP client.
- **1 code-execution tool** (`run_javascript_free`) — run a JavaScript/TypeScript snippet on the Deno runtime with **unrestricted** permissions (full filesystem, network, env, child processes, arbitrary imports): the "free" counterpart to sandboxed `run_javascript` tools that confine code to a working directory.
- **6 git tools** (`git_status`, `git_diff`, `git_commit`, `git_log`, `git_add`, `git_checkout`) — spawn the git CLI against the repo at the server process's current working directory (no new dependency, no working-directory parameter — the same "current working directory context" as the shell tools).
- **8 GitHub tools** (`gh_auth`, `gh_create_issue`, `gh_list_issues`, `gh_view_comments`, `gh_create_pr`, `gh_list_prs`, `gh_view_pr_diff`, `gh_push`) — spawn the `gh` CLI (and `git push` for `gh_push`) against the repo at the server process's current working directory (no new dependency, no working-directory parameter — the same "current working directory context" as the git/shell tools).
- **1 launcher tool** (`launch_file`, Windows-only) — opens files, folders, and http(s) links in their OS default app, fully detached: returns the moment the opener is spawned (never waits for the app), no console window, no stdio inheritance; filesystem targets are confined to the allowed directories.
- **Windows-first** — drive roots, UNC roots, long paths beyond the 260-char `MAX_PATH` limit, `cmd.exe /d /c` with verbatim argv, whole-process-tree kills (`taskkill /T /F`), detached interactive console windows.
- **NAS-safe startup** — an allowed directory that is missing or offline (e.g., a powered-down network share) logs a warning and the server continues instead of exiting.

## Requirements

- Node.js >= 20 (developed and tested on Node 22).
- Windows for the shell tools (they spawn `cmd.exe`, `taskkill`, and `powershell`). The filesystem tools work on any platform Node runs on.
- `shell_python` requires Python on the system PATH.
- `run_javascript_free` requires a Deno runtime: the `$DENO_PATH` env var, LM Studio's bundled binary (`<home>/.internal/utils/deno(.exe)` — auto-located by walking up from the server CWD or the user home), or `deno` on the PATH.

## Quick start (npm)

Published on npm — `npx` downloads the server (and all dependencies) and runs it:

```bat
npx -y mcp-fs-shell-windows C:\ D:\
```

MCP client config (Claude Desktop / LM Studio `mcp.json` style):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "mcp-fs-shell-windows", "C:\\", "D:\\", "\\\\server\\share"]
    }
  }
}
```

The filesystem tools can only touch the passed directories (and anything under them). A root that cannot be accessed at startup logs a warning and is skipped; the server keeps running. Note that the shell tools are **not** root-restricted — see [Security](#security).

## Build from source

For developers, or to run uncommitted changes:

```bat
git clone https://github.com/gerarddeluca/mcp-fs-shell-windows
cd mcp-fs-shell-windows
npm ci
npm run build
node dist\index.js <allowed-dir> [more-dirs...]
```

Then point your MCP config at `node <path-to-repo>\dist\index.js` with the allowed directories as the remaining args (same shape as the npx example above).

### Filesystem tools (30)

| Tool | Purpose |
|---|---|
| `read_files` | Read one or more files, line-numbered; `offset`/`limit` paging; per-file `encoding` (utf8/utf16le/utf16be/cp1252, auto-detected when omitted) |
| `write_new_files` | Create files (per-file `overwrite`, `textEncoding` utf8/utf16le/utf16be/cp1252, optional `base64` for binary) |
| `append_files` | Append to files (creates them if missing) |
| `delete_files` | Delete files/directories (`recursive`; junctions/symlinks are removed as links, never followed; `toRecycleBin` - Windows: send to Recycle Bin instead of permanent delete) |
| `copy_file` | Copy files/directories (`recursive`, `overwrite`) |
| `transfer_files` | Move/rename items (`overwrite`, creates parent dirs) |
| `patch_files` | Patch by line ranges (`replace`/`insertBefore`/`delete`, `dryRun`, git-diff output) |
| `create_directories` | Create directory paths (nested chains) |
| `list_directory` | Single-level listing ([FILE]/[DIR]/[LINK] prefixes, sizes, pagination, type filter, ignore globs) |
| `directory_tree` | Recursive tree view (JSON) with exclusion patterns; includes empty dirs and link nodes |
| `search_files` | Recursive case-insensitive name-substring search |
| `search_regex` | Content grep over a single file or directory tree (paged; total + per-file match counts, `countOnly` mode) |
| `search_glob` | Glob-based file search (e.g. `**/*.ts`, paged) |
| `fuzzy_find_files` | Typo-tolerant name/path search (Levenshtein) |
| `delete_files_by_pattern` | Regex delete within a single directory |
| `count_lines` | Line counts with filters |
| `file_diff` | Unified diff of two files |
| `content_diff` | Unified diff of two strings |
| `checksum_files` | md5/sha1/sha256/sha512 for files |
| `checksum_files_verif` | Verify files against expected hashes |
| `get_file_info` | Size, timestamps, type, permissions, `isReparsePoint`, (Windows) NTFS attributes |
| `edit_files` | Exact-match text replacement, EOL-tolerant (dominant line ending preserved) |
| `read_bytes` | Read raw bytes at (offset, length) as base64 JSON — any binary file, any size |
| `write_bytes` | Write raw bytes (base64) into an existing file at an offset — in place, or `extend` past EOF (gap zero-filled) |
| `replace_regex` | In-place regex replacement across one or more files; `dryRun` defaults to true (unified-diff preview); preserves dominant line endings |
| `dir_diff` | Recursive two-directory comparison (added/removed/changed/identical; unified diff for changed text files; `ignore` globs, `maxFiles` cap) |
| `convert_encoding` | Convert a file's text encoding (utf8/utf16le/utf16be/cp1252, source auto-detected) to a new file |
| `wait_for_file` | Poll until at least one file matching a glob appears under a directory (configurable timeout/interval) |
| `create_link` | Create a hardlink, directory junction, or file/directory symlink to an existing target (`auto`/`symlink`/`junction`/`hardlink`) |
| `list_allowed_directories` | List the allowed root directories |

### Shell tools (8, Windows-only)

User commands are spawned as `cmd.exe /d /c <command>` with **verbatim argv** — quotes, redirects, and metacharacters arrive byte-for-byte (Node `windowsVerbatimArguments`), and `/d` skips AutoRun registry entries.

| Tool | Purpose |
|---|---|
| `shell_run` | Synchronous command (default 5 s, max 28 s); non-zero exit or timeout returns the captured stdout/stderr instead of hiding it |
| `shell_test` | Test wrapper (runs with `CI=true`); never errors on a failing test |
| `shell_start` | Background job — returns immediately with a job ID; auto-kills at `timeout_hours` (max 10); 256 KB in-memory tail + log file |
| `shell_check` | Job status, stdout/stderr tails, log file path |
| `shell_cancel` | Kill the whole process tree (`taskkill /T /F`, with PID-liveness fallback) |
| `shell_terminal` | Open a visible, separate, interactive `cmd /k` console window running the command; the window persists after the command finishes; close it with `shell_cancel` |
| `shell_python` | Run a Python snippet (temp `.py` + system Python) |
| `shell_cwd` | Get/set the default working directory for the other shell tools (every tool also accepts a per-call `cwd`) |

Practical notes:

- Background jobs live in an **in-memory registry** inside the server process: the table is lost on server restart, but job log files persist (under `%TEMP%\mcp-fs-shell-windows\shell-jobs`).
- `timeout /t` can fail when stdin is not an interactive console — use `ping -n N 127.0.0.1 >nul` for sleeps.
- Synchronous calls are bounded (max 28 s) so they cannot wedge the MCP request channel; anything longer should go through `shell_start`.

### Code-execution tool (1)

| Tool | Purpose |
|---|---|
| `run_javascript_free` | Run a JS/TS snippet on the Deno runtime with **unrestricted permissions**: full filesystem read/write (any drive or UNC path the server user can reach), network, environment, child processes, and arbitrary imports (`node:*`, `npm:*`, `https:*`). Temp `.ts` file + `deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-run --allow-ffi --allow-import`. Default 5 s timeout, max 60 s; optional `cwd` (defaults to the `shell_cwd` default). Non-zero exit or timeout returns an error that still includes the captured stdout/stderr (100 KB / 20 KB caps). The Deno binary is located via `$DENO_PATH` → `<ancestor>/.internal/utils/deno(.exe)` (walk-up) → `<home>/.lmstudio/.internal/utils/deno(.exe)` → PATH. |

### Git tools (6)

Operate against the repo at the server process's current working directory (the directory the server was launched in, e.g. the chat working directory). Implemented by spawning the `git` CLI directly — no new dependency, and argument values (messages, branch names, file paths) never pass through a shell: they go verbatim as argv elements. Path arguments (`git_diff.file_path`, `git_add.paths`) resolve relative to the working directory. A working directory that is not inside a git repository yields a clear `{error}` string, not a crash.

| Tool | Purpose |
|---|---|
| `git_status` | Branch, upstream, ahead/behind, `isClean`, plus staged / not-staged / untracked file lists (JSON: `{current, tracking, ahead, behind, isClean, staged, notStaged, untracked, files}`). |
| `git_diff` | Working-tree or staged (`cached: true`) unified diff, optionally limited to one file (`file_path`). Returns `{diff}` (or `{diff: "No changes."}`). |
| `git_commit` | Commit staged changes with `message`; returns `{success, summary: {changed, insertions, deletions}}`. Standard git behavior: only what is staged gets committed. |
| `git_log` | Recent commits, newest first, capped by `max_count` (default 10): `{history: ["<hash> <subject> (<author>, <date relative>)", ...]}`. |
| `git_add` | Stage specific `paths` or, when omitted, all changes (`git add .`). Returns `{success, message}`. |
| `git_checkout` | Switch to an existing branch, or create + switch with `create_new: true` (`git checkout -b`). Returns `{success, message}`. |

### GitHub tools (8)

Operate against the repo at the server process's current working directory (no working-directory parameter — `gh` itself resolves the repo from that directory's git remote, exactly as the reference Beledarian tools do). Implemented by spawning the `gh` CLI directly (no new dependency; `gh_push` spawns `git push origin [branch]`), and argument values (titles, bodies, labels, branch names, issue/PR numbers) go verbatim as argv elements — they never pass through a shell. Long issue/PR bodies are written to a temp file in the working directory and passed via `--body-file` (mirroring the reference); the temp file is always removed. `gh` is resolved from PATH first (the reference's `checkGhInstalled`), then from the known portable install `<home>\tools\gh\bin\gh.exe` (this machine's layout); if neither is found, a clear `{error}` string is returned. `gh_auth` runs `gh auth status` and, on failure, opens a **detached** terminal window (`cmd /k`, spawned with ignored stdio so it outlives the tool call) for interactive `gh auth login` — using the resolved absolute gh path so the window works even when gh is not on the inherited PATH.

| Tool | Purpose |
|---|---|
| `gh_auth` | Check GitHub authentication status. On failure, open a detached terminal window for `gh auth login` (the window persists for the user to sign in). Returns `{success: true, message}` or `{error}`. |
| `gh_create_issue` | Create a new issue with `title`, optional `body` (temp `--body-file`) and optional `labels` (each `-l`). Returns `{success: true, url}` or `{error}`. |
| `gh_list_issues` | List issues in the CWD repo: `state` (default `open`), optional `labels`, `limit` (default 10, max 50). Returns `{issues: [{number, title, state, url, labels}]}` (empty array = no matches) or `{error}`. |
| `gh_view_comments` | View comments on issue/PR `number` (`type` default `issue`). Returns `{comments: [...]}` or `{error}`. |
| `gh_create_pr` | Create a PR: `title`, `head_branch`, optional `body` (temp `--body-file`), `base_branch` (default `main`). Returns `{success: true, url}` or `{error}`. |
| `gh_list_prs` | List PRs in the CWD repo: `state` (default `open`), `limit` (default 10, max 50). Returns `{pull_requests: [{number, title, state, url, headRefName, baseRefName}]}` or `{error}`. |
| `gh_view_pr_diff` | Fetch the PR's patch/diff for `number`. Returns `{diff}` (truncated to 50,000 chars with a marker) or `{error}`. |
| `gh_push` | Push local commits to the remote (`git push origin [branch]`); `branch` optional, defaults to the current branch. Returns `{success: true, message}` or `{error}`. |

### Launcher tool (1, Windows-only)

| Tool | Purpose |
|---|---|
| `launch_file` | Launch a file, folder, or http(s) link via the Windows shell opener (`explorer.exe` — the OS default association: VLC for .mkv, Explorer for folders, default browser for web links). The target is passed as a single argv element (spaces, Unicode, `&`, apostrophes, parentheses all safe) and the call returns as soon as the opener process is actually spawned — it never waits for the opened app, creates no console window, and inherits no stdio pipes. Filesystem paths are subject to the allowed-root policy and checked for existence; only `http://`/`https://` links are launched, every other URL scheme (`file:`, `javascript:`, `ms-*`, `steam:`, …) is rejected, so no `file:` URI can bypass the filesystem policy. A failed opener spawn errors instead of reporting success. The response reports `dispatched: true` (the opener process was created) — not that the app handled the target. A host-settable `LAUNCH_FILE_OPENER` env var overrides the opener executable (test seam). |

## Docker

```bat
docker build -t mcp-fs-shell-windows .
docker run -i --rm -v /path/to/dir:/data mcp-fs-shell-windows /data
```

The filesystem tools work in the image; the shell tools require a Windows host with `cmd.exe`.

## Differences from the base fork

**v0.2.1 — official-server parity:** head/tail reads (`offset`/`limit` in `read_files`), sizes in listings, `overwrite` in `write_new_files`, exact-match text editing (`edit_files`).

**`transfer_files` (renamed from `move_files`):** the canonical move/rename tool. Renamed because at least one MCP client (observed in LM Studio) silently drops tools named `move_files`/`mv_files` from the exposed tool list; `transfer_files` is registered last in the tools array.

**Robustness patches:**

- Missing/offline allowed roots warn at startup instead of exiting (NAS-down safe).
- `validatePath` walks to the nearest existing ancestor, so writes under brand-new nested directories work.
- `ensureDirectoryExists` at all `mkdir` sites (Node EPERM quirk on drive-root writes).
- Move-handler destination checks use errno `ENOENT`, so moves to fresh destinations succeed.
- `zod` pinned to `^3.23.8` (zod v4 breaks the SDK's schema conversion).

**v0.2.2 — shell tools** as listed above, with whole-process-tree kills and the detached interactive console window.

**v0.2.4 — verbatim argv:** `windowsVerbatimArguments` + `/d` on all user-command spawns (run/test/start and the terminal launcher).

**v0.2.7 — `launch_file`:** the detached OS launcher (see above). Renamed from a local `open_file` prototype so it cannot collide with other servers' `open_file` tools. Hardened: spawn-failure returns an error (the handler awaits the child's `spawn`/`error` events — it never reports success for a process Windows refused to create), URLs are restricted to http(s) so `file:` URIs cannot bypass the allowed-root policy, and non-Windows platforms fail with a clear error.

**v0.2.8 — line-ending preservation:** `patch_files` and `edit_files` preserve the file's dominant line ending (CRLF or LF) on write.

**v0.2.9 — `read_bytes` / `write_bytes`:** raw binary access at (offset, length) — base64 reads from any part of a file (any size, e.g. GGUFs and blobs) and in-place byte writes into existing files (`extend: true` grows the file past EOF, zero-filling the gap).

**v0.2.10 — `dir_diff`:** recursive comparison of two directory trees — added/removed/changed/identical, unified diffs for changed text files, `ignore` glob patterns, and a `maxFiles` cap.

**v0.2.11 — text encoding support:** per-file `encoding` in `read_files` (utf8/utf16le/utf16be/cp1252, auto-detected from BOMs when omitted), `textEncoding` in `write_new_files`, and `convert_encoding` to transcode a file into a new encoding.

**v0.2.12 — `wait_for_file`:** polling file watcher — waits (up to `timeoutMs`, default 30 s, max 300 s) until at least one file matching a glob appears under a directory.

**v0.2.13 — `search_regex` match totals:** every pattern occurrence is counted (a line matching N times counts N); responses end with the total and per-file counts, and `countOnly: true` returns counts without the matching line text.

**v0.2.14 — `replace_regex`:** in-place regex replacement across one or more files (directories are rejected). `dryRun` defaults to `true` with a unified-diff preview; applied replacements preserve each file's dominant line ending; a missing path or invalid regex errors without writing anything.

**v0.2.15 — reparse-point safety:** junctions/symlinks are never followed. `delete_files` removes them as links (including nested links inside recursive deletes) without touching their targets; `list_directory` shows `[LINK]` entries; `directory_tree` reports link nodes and includes empty directories; `get_file_info` adds `isReparsePoint` and (on Windows) NTFS attributes.

**v0.2.16 — long-path support:** paths beyond the 260-char `MAX_PATH` limit work on Windows via `\\?\` extended-length form (drive and UNC), transparent to callers.

**v0.2.17 — `delete_files` `toRecycleBin`:** send deletes to the Windows Recycle Bin instead of permanent removal. Reparse points are still removed as links (the bin cannot hold them), and any path that cannot be recycled is reported as an error — never silently hard-deleted.

**v0.2.18 — `create_link`:** create hardlinks, directory junctions, and file/directory symlinks (`type: auto | symlink | junction | hardlink`) with strict checks: the target must exist, the link path must not, and the link path's parent must exist.

**v0.2.20 — `run_javascript_free`:** unrestricted JS/TS code execution on the Deno runtime — full filesystem, network, env, child-process, and import permissions (no working-directory sandbox). Reuses the shell layer's spawn/capture machinery (temp `.ts` in the shell-jobs dir, whole-tree kill on timeout, 100 KB / 20 KB output caps). The Deno binary is auto-located (`$DENO_PATH` → LM Studio's bundled `.internal/utils/deno(.exe)` via CWD walk-up or user home → PATH); missing binary yields a clear error. Default 5 s timeout, max 60 s.

**v0.2.21 — git tools:** six new tools (`git_status`, `git_diff`, `git_commit`, `git_log`, `git_add`, `git_checkout`) that spawn the git CLI against the repo at the server process's current working directory (no working-directory parameter; path arguments resolve against it). No new dependency. Failure (e.g. working directory not inside a git repository) returns a clear `{error}` string, mirroring the reference Beledarian tool shapes ({diff}, {history}, {success, ...}).

**v0.2.22 — GitHub tools:** eight new tools (`gh_auth`, `gh_create_issue`, `gh_list_issues`, `gh_view_comments`, `gh_create_pr`, `gh_list_prs`, `gh_view_pr_diff`, `gh_push`) that spawn the `gh` CLI (and `git push` for `gh_push`) against the repo at the server process's current working directory — no new dependency, no working-directory parameter (gh resolves the repo from the CWD's git remote, as the reference Beledarian tools do). `gh` is found on PATH (the reference's `checkGhInstalled`) with a documented fallback to the known portable install `<home>\tools\gh\bin\gh.exe`. Long issue/PR bodies go via a temp `--body-file` in the working directory (always cleaned up); a failed `gh auth status` opens a detached `cmd /k` terminal for interactive `gh auth login`. Failure (missing gh, bad remote/branch, unauthenticated) returns a clear `{error}` string, mirroring the reference tool shapes ({success, url}, {issues}, {pull_requests}, {comments}, {diff}).

## Security

- The filesystem tools are confined to the allowed directories passed at startup (and their subtrees).
- The shell tools are **not** confined: anything the server process's user can execute will run, including against reachable network shares. Grant this server the same trust you would grant an unsandboxed shell.
- `launch_file` targets are confined to the allowed directories (for paths), but the opened application runs with the full rights of the server user — like anything you double-click.
- `run_javascript_free` is **not** confined: the snippet runs as an unsandboxed Deno process with the full rights of the server user (filesystem, network, processes). Grant this server the same trust you would grant an unsandboxed shell.
- The server communicates over stdio and opens no network endpoints of its own.

## License

MIT — see [LICENSE](./LICENSE). This project derives from MIT-licensed code (Anthropic, PBC; fabienvauchelles); all copyright notices are in the LICENSE file.
