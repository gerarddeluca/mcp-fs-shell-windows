# mcp-fs-shell-windows — filesystem + standalone Windows shell MCP server

A Windows-first MCP server that gives AI clients **comprehensive filesystem access** (batched read/write/search/patch across your chosen drives and UNC shares) plus **reliable local shell execution** (synchronous, background, and interactive) — in a single Node.js process with no client-side permission toggles.

Heavily extended fork of [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended), which itself extends the official [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem). Developed and tested primarily on **Windows**: drive-letter roots (`C:\`, `D:\`) and UNC network-share roots (`\\server\\share`) are first-class, and the shell tools run commands through `cmd.exe` byte-for-byte.

**npm:** [mcp-fs-shell-windows](https://www.npmjs.com/package/mcp-fs-shell-windows) · **Source:** [gerarddeluca/mcp-fs-shell-windows](https://github.com/gerarddeluca/mcp-fs-shell-windows)

## Provenance

| Layer | Source |
|---|---|
| Official base | `@modelcontextprotocol/server-filesystem` (Anthropic, PBC; MIT) |
| Base fork | [fabienvauchelles/mcp-filesystem-extended](https://github.com/fabienvauchelles/mcp-filesystem-extended) @ `b6c317a` (MIT) |
| This fork | v0.2.1 tool parity + `transfer_files` rename, robustness patches, 8 shell tools (v0.2.2), verbatim argv (v0.2.4), `launch_file` launcher (v0.2.7) — see [Differences](#differences-from-the-base-fork) |

## Features

- **23 filesystem tools** — batched read/write/append/delete, move/copy, line-number patching, search (name / glob / regex / fuzzy), tree, counts, checksums, diffs, exact-match text editing. Confined to the allowed directories passed on the command line.
- **8 shell tools** — synchronous, background, and interactive command execution implemented *inside the MCP server process*: no client-side permission toggles, survives client restarts, works with any MCP client.
- **1 launcher tool** (`launch_file`, Windows-only) — opens files, folders, and http(s) links in their OS default app, fully detached: returns the moment the opener is spawned (never waits for the app), no console window, no stdio inheritance; filesystem targets are confined to the allowed directories.
- **Windows-first** — drive roots, UNC roots, `cmd.exe /d /c` with verbatim argv, whole-process-tree kills (`taskkill /T /F`), detached interactive console windows.
- **NAS-safe startup** — an allowed directory that is missing or offline (e.g., a powered-down network share) logs a warning and the server continues instead of exiting.

## Requirements

- Node.js >= 20 (developed and tested on Node 22).
- Windows for the shell tools (they spawn `cmd.exe`, `taskkill`, and `powershell`). The filesystem tools work on any platform Node runs on.
- `shell_python` requires Python on the system PATH.

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

### Filesystem tools (23)

| Tool | Purpose |
|---|---|
| `read_files` | Read one or more files, line-numbered; `offset`/`limit` paging |
| `write_new_files` | Create files (per-file `overwrite`, optional `base64` encoding) |
| `append_files` | Append to files (creates them if missing) |
| `delete_files` | Delete files/directories (`recursive`) |
| `copy_file` | Copy files/directories (`recursive`, `overwrite`) |
| `transfer_files` | Move/rename items (`overwrite`, creates parent dirs) |
| `patch_files` | Patch by line ranges (`replace`/`insertBefore`/`delete`, `dryRun`, git-diff output) |
| `create_directories` | Create directory paths (nested chains) |
| `list_directory` | Single-level listing (sizes, pagination, type filter, ignore globs) |
| `directory_tree` | Recursive tree view (JSON) with exclusion patterns |
| `search_files` | Recursive case-insensitive name-substring search |
| `search_regex` | Content grep over a single file or directory tree (paged) |
| `search_glob` | Glob-based file search (e.g. `**/*.ts`, paged) |
| `fuzzy_find_files` | Typo-tolerant name/path search (Levenshtein) |
| `delete_files_by_pattern` | Regex delete within a single directory |
| `count_lines` | Line counts with filters |
| `file_diff` | Unified diff of two files |
| `content_diff` | Unified diff of two strings |
| `checksum_files` | md5/sha1/sha256/sha512 for files |
| `checksum_files_verif` | Verify files against expected hashes |
| `get_file_info` | Size, timestamps, type, permissions |
| `edit_files` | Exact-match text replacement, EOL-tolerant |
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

## Security

- The filesystem tools are confined to the allowed directories passed at startup (and their subtrees).
- The shell tools are **not** confined: anything the server process's user can execute will run, including against reachable network shares. Grant this server the same trust you would grant an unsandboxed shell.
- `launch_file` targets are confined to the allowed directories (for paths), but the opened application runs with the full rights of the server user — like anything you double-click.
- The server communicates over stdio and opens no network endpoints of its own.

## License

MIT — see [LICENSE](./LICENSE). This project derives from MIT-licensed code (Anthropic, PBC; fabienvauchelles); all copyright notices are in the LICENSE file.
