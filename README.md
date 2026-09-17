# mcp-fs-shell-windows — filesystem + standalone Windows shell MCP server

A Windows-first MCP server that gives AI clients **comprehensive filesystem access** (30 tools), **reliable local shell execution** (8 tools), and a full **Beledarian-parity tool set** — git, GitHub, system, document, database, web, RAG, browser, and sub-agent tools (82 tools total) — in a single Node.js process with no client-side permission toggles.

Heavily extended fork of [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended), which itself extends the official [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem). Developed and tested primarily on **Windows**: drive-letter roots (`C:\`, `D:\`) and UNC network-share roots (`\\server\\share`) are first-class, and the shell tools run commands through `cmd.exe` byte-for-byte.

**npm:** [mcp-fs-shell-windows](https://www.npmjs.com/package/mcp-fs-shell-windows) · **Source:** [gerarddeluca/mcp-fs-shell-windows](https://github.com/gerarddeluca/mcp-fs-shell-windows)

## Provenance

| Layer | Source |
|---|---|
| Official base | `@modelcontextprotocol/server-filesystem` (Anthropic, PBC; MIT) |
| Base fork | [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended) @ `b6c317a` (MIT) |
| Parity layer (v0.2.21–v0.2.29) | [Beledarian/Beledarians_LM_Studio_Toolbox](https://github.com/Beledarian/Beledarians_LM_Studio_Toolbox) — the “Beledarian” LM Studio plugin (Laurin Feulner; MIT): 42-tool port (git, GitHub, system, document/database, web, RAG, browser, Beledarian-named compatibility aliases, sub-agent) |
| This fork | v0.2.1 tool parity + `transfer_files` rename, robustness patches, 8 shell tools (v0.2.2), verbatim argv (v0.2.4), `launch_file` launcher (v0.2.7), raw-byte access + `dir_diff` + text encodings (v0.2.9–v0.2.11), `wait_for_file` (v0.2.12), `replace_regex` (v0.2.14), reparse-point & long-path hardening (v0.2.15–v0.2.16), Recycle-Bin deletes (v0.2.17), `create_link` (v0.2.18), `run_javascript_free` unrestricted code execution (v0.2.20) — see [Differences](#differences-from-the-base-fork) |

## Features

- **30 filesystem tools** — batched read/write/append/delete (including raw-byte access, per-file text encodings, Recycle-Bin deletes, and link creation), move/copy, line-number patching, search (name / glob / regex / fuzzy / wait-for-file), in-place regex replacement, tree, counts, checksums, file and directory diffs, exact-match text editing. Confined to the allowed directories passed on the command line.
- **8 shell tools** — synchronous, background, and interactive command execution implemented *inside the MCP server process*: no client-side permission toggles, survives client restarts, works with any MCP client.
- **1 code-execution tool** (`run_javascript_free`) — run a JavaScript/TypeScript snippet on the Deno runtime with **unrestricted** permissions (full filesystem, network, env, child processes, arbitrary imports): the "free" counterpart to sandboxed `run_javascript` tools that confine code to a working directory.
- **6 git tools** (`git_status`, `git_diff`, `git_commit`, `git_log`, `git_add`, `git_checkout`) — spawn the git CLI against the repo at the server process's current working directory (no new dependency, no working-directory parameter — the same "current working directory context" as the shell tools).
- **8 GitHub tools** (`gh_auth`, `gh_create_issue`, `gh_list_issues`, `gh_view_comments`, `gh_create_pr`, `gh_list_prs`, `gh_view_pr_diff`, `gh_push`) — spawn the `gh` CLI (and `git push` for `gh_push`) against the repo at the server process's current working directory (no new dependency, no working-directory parameter — the same "current working directory context" as the git/shell tools).
- **6 system tools** (`get_system_info`, `read_clipboard`, `write_clipboard`, `send_notification`, `open_file`, `preview_html`) — Beledarian-parity system utilities: OS/CPU/memory info, clipboard read/write (5-second timeout; empty clipboard = empty content, not an error), desktop notifications, opening files/URLs, and HTML preview. New dependency: `node-notifier` (notifications only; Windows toasts via the bundled snoretoast binary). `open_file` is the Beledarian-named equivalent of `launch_file` and delegates to the same internal launch helper.
- **3 document & database tools** (`read_document`, `query_database`, `analyze_project`) — PDF/DOCX text extraction, read-only SQLite queries (built-in `node:sqlite`, no native dependency), and project-wide lint detection (npm lint script → eslint → pylint).
- **3 web tools** (`web_search`, `fetch_web_content`, `wikipedia_search`) — multi-provider web search (DuckDuckGo → Google → Bing fallback chain), clean page-text extraction, and Wikipedia extracts.
- **2 RAG tools** (`rag_local_files`, `rag_web_content`) — retrieval-augmented generation over local text files or a fetched URL, via a local OpenAI-compatible `/v1/embeddings` endpoint (default: LM Studio on `127.0.0.1:1234`, bundled nomic-embed-text v1.5 model).
- **4 browser tools** (`browser_session_open`, `browser_session_control`, `browser_session_close`, `browser_open_page`) — persistent headless Chrome sessions (scripted click/type/press/select/hover/scroll/evaluate actions, screenshots, fuzzy in-page find) plus a stateless one-shot page renderer; Chrome-for-Testing via puppeteer-core.
- **9 Beledarian-compatible aliases** (`execute_command`, `run_in_terminal`, `run_test_command`, `run_background_command`, `check_background_command`, `cancel_background_command`, `run_python`, `run_javascript`, `save_memory`) — drop-in names, parameter shapes, and return shapes for the reference Beledarian plugin's tools (60 s sync cap; `run_javascript` = the confined Deno variant, NOT `run_javascript_free`).
- **1 sub-agent tool** (`consult_secondary_agent`) — delegates a task to a secondary agent loop running against a local model endpoint (default: LM Studio on `http://localhost:1234/v1`); the sub-agent's tool calls execute in-process against this server's own handlers.
- **1 launcher tool** (`launch_file`, Windows-only) — opens files, folders, and http(s) links in their OS default app, fully detached: returns the moment the opener is spawned (never waits for the app), no console window, no stdio inheritance; filesystem targets are confined to the allowed directories.
- **Windows-first** — drive roots, UNC roots, long paths beyond the 260-char `MAX_PATH` limit, `cmd.exe /d /c` with verbatim argv, whole-process-tree kills (`taskkill /T /F`), detached interactive console windows.
- **NAS-safe startup** — an allowed directory that is missing or offline (e.g., a powered-down network share) logs a warning and the server continues instead of exiting.

## Requirements

- Node.js >= 20 (developed and tested on Node 22).
- Windows for the shell tools (they spawn `cmd.exe`, `taskkill`, and `powershell`). The filesystem tools work on any platform Node runs on.
- `shell_python` requires Python on the system PATH.
- `run_javascript_free` (unrestricted) and `run_javascript` (confined compat alias) require a Deno runtime: the `$DENO_PATH` env var, LM Studio's bundled binary (`<home>/.internal/utils/deno(.exe)` — auto-located by walking up from the server CWD or the user home), or `deno` on the PATH.
- The browser tools (`browser_*`) and `web_search`'s browser legs require a **Chrome-for-Testing** executable: set `MCP_CHROME_PATH`, or place a build under the standard puppeteer cache `<home>/.cache/puppeteer/chrome/win64-<version>/chrome-win64/chrome.exe` (auto-detected, highest version wins).
- `rag_local_files` / `rag_web_content` require a local OpenAI-compatible embeddings endpoint (default: `http://127.0.0.1:1234/v1/embeddings` — LM Studio), and `consult_secondary_agent` requires a local chat-completions endpoint (default: `http://localhost:1234/v1` — LM Studio).

Optional environment variables (all optional; when unset, behavior on the reference machine is preserved):

| Variable | Effect | Default |
|---|---|---|
| `MCP_CHROME_PATH` | Explicit Chrome-for-Testing executable | auto-detect the standard puppeteer cache, then the legacy path |
| `MCP_MEMORY_FILE` | `save_memory` memory-file path | reference workspace `memory.md`, else `<cwd>/memory.md` |
| `MCP_RAG_EMBED_URL` | RAG embeddings endpoint | `http://127.0.0.1:1234/v1/embeddings` |
| `MCP_RAG_EMBED_MODEL` | Embeddings model id | `text-embedding-nomic-embed-text-v1.5` |
| `MCP_API_TOKEN_FILE` | API-token file for RAG + sub-agent Bearer auth | reference overnight token file (keyless when missing) |
| `MCP_SUBAGENT_ENDPOINT` | Sub-agent chat-completions endpoint | `http://localhost:1234/v1` |
| `MCP_SUBAGENT_MODEL` | Sub-agent model id | `local-model` |
| `MCP_SUBAGENT_CWD` | Sub-agent working dir (its file tools are confined to it) | server CWD |
| `MCP_SUBAGENT_PROFILES` | JSON string `{role: personaText}` agent profiles | built-ins |
| `MCP_SUBAGENT_DEBUG` | `"1"` = `[Sub-Agent]` console logging | off |

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

Unit tests cover the ported pure-function modules (browser actions, fuzzy search, sub-agent call parsing / validation / handoff): `npm test`.

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

### System tools (6)

Beledarian-parity system utilities, ported from the reference Beledarian `toolsProvider` (same names, parameter shapes, and return shapes). No working-directory parameter; the clipboard and notification tools work on any platform Node runs on (PowerShell / pbpaste / xclip branches, as in the reference), while `open_file` and `preview_html` are Windows-only (they use the same `explorer.exe` detached opener as `launch_file`).

| Tool | Purpose |
|---|---|
| `get_system_info` | OS/CPU/memory info via the Node `os` module. No parameters. Returns `{platform, arch, release, hostname, total_memory, free_memory, cpus, node_version}` (memory in bytes). |
| `read_clipboard` | Read the system clipboard (`powershell -command Get-Clipboard` on Windows; `pbpaste` on macOS; `xclip` elsewhere) with a 5-second race timeout. An empty clipboard returns `content ""` (not an error). Returns `{content}` or a clear error. |
| `write_clipboard` | Write text to the clipboard. On Windows the content is base64-encoded into the PowerShell command line and `Set-Clipboard` stores the decoded text (no escaping issues for quotes / newlines / Unicode); `pbcopy` on macOS, `xclip` via stdin elsewhere. 5-second race timeout. Returns `{success: true}` or a clear error. |
| `send_notification` | Send a desktop notification (title, message) via `node-notifier` (Windows toast through the bundled snoretoast; balloon fallback) — fire-and-forget (`sound: true, wait: false`), as in the reference. Returns `{success: true, message}`. |
| `open_file` | Open a file path or http(s) URL in the OS default app. The Beledarian-named equivalent of `launch_file`: same `target` parameter, same policy (allowed-roots for filesystem paths + existence check; only http/https URLs), same internal launch helper. Returns `{success: true, message}` or a clear error. |
| `preview_html` | Write `html_content` to a temp `.html` file in the system temp dir (user-supplied `file_name` reduced to its last path segment; default `preview_<timestamp>.html`), launch it in the default browser with the same detached opener, and leave the file on disk. Returns `{success: true, path, message}`. |

### Document & database tools (3)

| Tool | Purpose |
|---|---|
| `read_document` | Read text + metadata from a PDF (pdf-parse) or DOCX (mammoth) file; other formats return a clear error. |
| `query_database` | Run a read-only SQL query against a SQLite database via Node's built-in `node:sqlite` (no native dependency); write statements (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/REPLACE) are rejected up-front. |
| `analyze_project` | Run project-wide linting: auto-detects the project's linter (npm `lint` script → eslint → pylint) and runs it with a 60 s timeout, returning the report (capped at 10,000 chars). |

### Web tools (3)

Ported from the reference Beledarian plugin (the DuckDuckGo chain and the Wikipedia API are near-verbatim; the browser legs share the single puppeteer launcher above).

| Tool | Purpose |
|---|---|
| `web_search` | Multi-provider web search with a fallback chain (DuckDuckGo fetch → api → html, then Google, then Bing — the html/google/bing legs run in the headless browser); per-provider errors are collected, not fatal; optional `providers` list to force an order; results deduped by link. |
| `fetch_web_content` | Fetch a URL and return clean, text-based page content (title + body via html-to-text, 40,000-char cap). |
| `wikipedia_search` | Search Wikipedia via the MediaWiki API: top-3 pages + intro extracts (2,000-char cap each), optional `lang`. |

### RAG tools (2)

Retrieval-augmented generation over local text or a fetched URL. Embeddings go through a local OpenAI-compatible `/v1/embeddings` endpoint (default: LM Studio on `127.0.0.1:1234`, model `text-embedding-nomic-embed-text-v1.5`; override with `MCP_RAG_EMBED_MODEL` / `MCP_RAG_EMBED_URL`); Bearer token from `MCP_API_TOKEN_FILE` when present (keyless otherwise).

| Tool | Purpose |
|---|---|
| `rag_local_files` | Recursively scan up to 50 text files under a directory (binary extensions skipped), chunk by paragraph, and return the top 10 chunks scoring above cosine similarity 0.4 against the query (`{file, score, content}`). |
| `rag_web_content` | Fetch a URL, convert it to plain text, and return the top 5 chunks most relevant to the query. |

### Browser tools (4)

Headless Chrome-for-Testing via puppeteer-core (executable resolution: `MCP_CHROME_PATH` → standard puppeteer cache → legacy path). One **persistent session per server process**: `browser_session_open` replaces the existing session (closing its browser first), and the session holds its own instance so `web_search`'s legs can never close it mid-session.

| Tool | Purpose |
|---|---|
| `browser_session_open` | Open the persistent session, navigate (networkidle0, 30 s timeout), optional `wait_for_selector`, full page-text capture. |
| `browser_session_control` | Scripted actions on the active page (wait / click / type / press / select / hover / scroll / evaluate), page metadata / full-text reads, screenshots (optionally full page), fuzzy in-page find. |
| `browser_session_close` | Close the active session (idempotent). |
| `browser_open_page` | Stateless one-shot render: navigate, optional scripted actions + screenshot, return page text (5,000-char cap). Never touches the persistent session. |

### Beledarian-compat aliases (9)

Drop-in names, parameter shapes, and return shapes for the reference Beledarian plugin's tools, so existing prompts and tool documentation keep working. Each alias delegates to this server's native handler (identical behavior and job-registry lifetime); the synchronous ones keep Beledarian's 60 s cap (the native `shell_*` tools cap at 28 s).

| Tool | Purpose |
|---|---|
| `execute_command` | Bounded synchronous execution — alias of `shell_run` with the 60 s cap and the same result shape (`{command, exitCode, stdout, stderr, timedOut, duration_ms, cwd}`). |
| `run_in_terminal` | Open a separate, visible, interactive `cmd /k` console window — alias of `shell_terminal`. |
| `run_test_command` | Test wrapper (`CI=true`), never errors on a failing test — alias of `shell_test`. |
| `run_background_command` | Start a background job with a descriptive name — alias of `shell_start`. |
| `check_background_command` | Job status, stdout/stderr tails, log-file path — alias of `shell_check`. |
| `cancel_background_command` | Kill the whole job process tree — alias of `shell_cancel`. |
| `run_python` | Run a Python snippet (temp `.py` + system Python) — alias of `shell_python` with the 60 s cap. |
| `run_javascript` | Run a JS/TS snippet in the **confined** Deno sandbox (`--allow-read=. --allow-write=.`, net/env/sys/run/ffi denied) — the reference plugin's `run_javascript` semantics; NOT an alias of `run_javascript_free`. |
| `save_memory` | Append a timestamped fact to the memory file (path: `MCP_MEMORY_FILE` → reference workspace `memory.md` → `<cwd>/memory.md`), creating it with a `# Long-Term Memory` header when missing. No enable gate. |

### Sub-agent tool (1)

| Tool | Purpose |
|---|---|
| `consult_secondary_agent` | Delegate a task to a secondary agent loop running against a local model endpoint (default `http://localhost:1234/v1`, model `local-model` — the LM Studio Developer API). Tool calls are parsed out of prose, validated, and executed **in-process** against this server's own handlers (file ops confined to the sub-agent's working directory); code blocks from the final response are auto-saved. Returns `{response, generated_files, filesModified, handoff_message?}` or `{error}`. |

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

**v0.2.23 — system tools:** six new tools (`get_system_info`, `read_clipboard`, `write_clipboard`, `send_notification`, `open_file`, `preview_html`) ported from the reference Beledarian `toolsProvider` (same names, parameter shapes, and return shapes): OS/CPU/memory info via the Node `os` module; clipboard read/write with the reference's platform branches (PowerShell Get-Clipboard / Set-Clipboard on Windows, pbpaste / pbcopy / xclip elsewhere), its 5-second race timeout, its base64 `Set-Clipboard` approach (no escaping issues), and its empty-clipboard-is-empty-content behavior; desktop notifications via `node-notifier` (the only new runtime dependency — Windows toasts through the bundled snoretoast, fire-and-forget `sound: true, wait: false`); `open_file` (the Beledarian-named `launch_file` equivalent: same `target` parameter, policy, and internal launch helper, reference success shape); and `preview_html` (temp `.html` in the system temp dir, launched in the default browser, temp path returned). `openerPath()` in `launch_file/handler.ts` gained `export` (no behavior change) so `preview_html` reuses the exact same opener resolution.

**v0.2.24 — document, database, and project tools:** `read_document` (PDF via pdf-parse 2.x + DOMMatrix polyfill; DOCX via mammoth), `query_database` (read-only SQLite via Node's built-in `node:sqlite` — no native dependency; write statements rejected up-front), `analyze_project` (lint detection: npm `lint` script → eslint → pylint; 60 s timeout; 10,000-char report cap).

**v0.2.25 — web tools:** `web_search` (DuckDuckGo fetch/api/html → Google → Bing fallback chain, ported near-verbatim from the reference; browser legs share the single puppeteer launcher), `fetch_web_content` (html-to-text clean page text, 40,000-char cap), `wikipedia_search` (MediaWiki API, top 3 + intro extracts). New deps: `duck-duck-scrape`, `puppeteer-core`.

**v0.2.26 — RAG tools:** `rag_local_files` / `rag_web_content` — paragraph chunking, cosine similarity > 0.4, top 10 / top 5; embeddings via the local `/v1/embeddings` endpoint (default model `text-embedding-nomic-embed-text-v1.5`; `MCP_RAG_EMBED_MODEL` / `MCP_RAG_EMBED_URL` overrides). No new deps (node fetch).

**v0.2.27 — browser tools:** `browser_session_open` / `browser_session_control` / `browser_session_close` (one persistent session per server process) + stateless `browser_open_page`; scripted actions, screenshots, fuzzy find; ported `browserActions.ts` / `fuzzySearch.ts` with unit tests. No new deps beyond v0.2.25's `puppeteer-core`.

**v0.2.28 — Beledarian-compat aliases:** `save_memory` + 8 aliases (`execute_command`, `run_in_terminal`, `run_test_command`, `run_background_command`, `check_background_command`, `cancel_background_command`, `run_python`, `run_javascript`) — drop-in names/shapes for the reference plugin's tools, delegating to native handlers with the reference's 60 s synchronous cap. No new deps.

**v0.2.29 — sub-agent tool:** `consult_secondary_agent` — delegated agent loop against the local model endpoint (default `http://localhost:1234/v1`, model `local-model`); tool calls parsed from prose, validated, and executed in-process against the fork's own handlers (file ops confined to the sub-agent's CWD); handoff-message extraction + auto-save of final code blocks. No new deps.

**Publish portability (v0.2.29):** the Chrome-for-Testing executable is resolved as `MCP_CHROME_PATH` → standard puppeteer cache (`<home>/.cache/puppeteer/chrome/`, highest version) → legacy path; `MCP_API_TOKEN_FILE` selects the API-token file for RAG + sub-agent Bearer auth; `MCP_RAG_EMBED_URL` selects the embeddings endpoint; the `save_memory` path is `MCP_MEMORY_FILE` → reference workspace → `<cwd>/memory.md`. With every env var unset, behavior on the reference machine is unchanged.

## Security

- The filesystem tools are confined to the allowed directories passed at startup (and their subtrees).
- The shell tools are **not** confined: anything the server process's user can execute will run, including against reachable network shares. Grant this server the same trust you would grant an unsandboxed shell.
- `launch_file` targets are confined to the allowed directories (for paths), but the opened application runs with the full rights of the server user — like anything you double-click.
- `run_javascript_free` is **not** confined: the snippet runs as an unsandboxed Deno process with the full rights of the server user (filesystem, network, processes). Grant this server the same trust you would grant an unsandboxed shell.
- `consult_secondary_agent` delegates to a local model endpoint (default `http://localhost:1234/v1`); the sub-agent's file tools are confined to its working directory (default: the server's CWD, override with `MCP_SUBAGENT_CWD`), and its tool calls execute in-process against this server's own handlers.
- The server communicates over stdio and opens no network listeners of its own; the web, RAG, browser, and sub-agent tools make outbound calls to the endpoints documented above.

## License

MIT — see [LICENSE](./LICENSE). This project derives from MIT-licensed code (Anthropic, PBC; fabienvauchelles; Laurin Feulner / Beledarian); all copyright notices are in the LICENSE file.
