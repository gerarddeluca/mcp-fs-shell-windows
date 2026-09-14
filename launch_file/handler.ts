import fs from "fs/promises";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { validatePath, stripLongPath } from "../helpers/path.js";

/**
 * Launch a file, directory, or web link in its Windows-associated
 * application (the OS default: e.g. VLC for .mkv/.mp4, Explorer for
 * folders, the default browser for http(s) links).
 *
 * Windows-only. Mechanism: spawn the shell opener with the target as a
 * single argv element and stdio ignored:
 *   %SystemRoot%\explorer.exe <target>
 *
 *   - Default association: explorer.exe performs a ShellExecute "open" -
 *     exactly what a double-click does. Nothing is hardcoded.
 *   - No pipe inheritance: stdio is "ignore", so the launched process never
 *     receives the MCP server's stdin/stdout/stderr. The handler resolves
 *     the moment Windows has spawned the opener - it does NOT stay pending
 *     until the opened application exits (the exact bug the cmd+start route
 *     hit: a long-lived GUI child held the pipes open).
 *   - No intermediary console: the opener is a GUI process and the spawn
 *     uses windowsHide, so no blank cmd.exe / PowerShell window appears.
 *   - Verbatim arguments: the target is one argv element, so spaces,
 *     Unicode, apostrophes, ampersands, parentheses, and every other
 *     filename character are passed through exactly (no cmd/PowerShell
 *     quoting to get wrong).
 *   - Security policy: filesystem targets are routed through validatePath
 *     (same allowed-roots + symlink resolution as every other tool). Only
 *     http:// and https:// links are dispatched to the OS directly; every
 *     other URL scheme (file:, javascript:, ms-*, steam:, vlc:, ...) is
 *     rejected so the tool cannot reach arbitrary Windows protocol
 *     handlers or bypass the allowed-roots policy.
 */

// Standard-form web links - the ONLY URLs dispatched to the OS opener.
const WEB_URL = /^https?:\/\//i;
// A Windows drive path: single letter, ':', then a separator or end of
// string, e.g. "M:\\...", "C:/...", or a bare "M:".
const WINDOWS_DRIVE = /^[A-Za-z]:([\\/]|$)/;
// A URI scheme: 2+ scheme chars then ':'. (A bare drive letter is exactly
// one char, so "M:foo" is NOT mistaken for a scheme and still resolves as
// a drive-relative path through validatePath.)
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]+:/;

/**
 * Windows-only guard; returns the full path to the shell opener.
 *
 * The opener defaults to %SystemRoot%\explorer.exe. The host-settable
 * LAUNCH_FILE_OPENER environment variable overrides it - a test seam that
 * makes the spawn-failure path testable end-to-end without touching the
 * real environment (note: faking SystemRoot itself is impossible; Node's
 * Windows CSPRNG init aborts unless SystemRoot is the real Windows dir).
 * Only the opener executable changes; the target still passes the full
 * URL/path policy below.
 */
// Exported (v0.2.23) so the system tools (preview_html) can reuse the exact
// same opener resolution — no behavior change.
export function openerPath(): string {
  if (process.platform !== "win32") {
    throw new Error("launch_file is supported only on Windows");
  }
  const override = process.env.LAUNCH_FILE_OPENER;
  if (override) {
    return override;
  }
  const sysRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(sysRoot, "explorer.exe");
}

/**
 * Spawn the opener fully detached and settle the promise only when
 * Windows has actually created the process ("spawn" event). A failed
 * process creation ("error" event, e.g. opener executable missing)
 * REJECTS - it never falsely reports success. Never waits for the opener
 * to exit.
 *
 * Both listeners are removed on settlement, so there is no double
 * settlement and no listener leak. Exported so tests can exercise both
 * settlement paths directly.
 */
export function launchDetached(opener: string, target: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(opener, [target], {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }

    const onSpawn = () => {
      child.removeListener("error", onError);
      child.unref();
      resolve();
    };
    const onError = (err: Error) => {
      child.removeListener("spawn", onSpawn);
      child.unref();
      reject(err);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

export async function handleLaunchFile(
  target: string,
  allowedDirectories: string[]
): Promise<string> {
  const trimmed = (target ?? "").trim();
  if (!trimmed) {
    throw new Error("path must not be empty");
  }

  const opener = openerPath();

  // --- Web link: only http/https; ask the OS to open it (default browser) ---
  if (WEB_URL.test(trimmed)) {
    try {
      await launchDetached(opener, trimmed);
    } catch (err) {
      throw new Error(`Failed to launch URL: ${errorMessage(err)}`);
    }
    return JSON.stringify({ target: trimmed, kind: "url", dispatched: true });
  }

  // --- Other URL schemes: reject. This keeps file: URLs (and any other
  //     registered protocol handler) from bypassing the filesystem policy. ---
  if (URI_SCHEME.test(trimmed) && !WINDOWS_DRIVE.test(trimmed)) {
    throw new Error(
      "Unsupported URL: only http:// and https:// links can be launched. " +
        'Filesystem targets must be plain paths (e.g. "M:\\..." or "\\\\server\\share"), ' +
        "not file: URLs or other protocol schemes."
    );
  }

  // --- Filesystem target: enforce the existing path/security policy ---
  const resolved = await validatePath(trimmed, allowedDirectories);

  // Useful error for a target that does not exist.
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(`Cannot launch: path does not exist: ${stripLongPath(resolved)}`);
  }

  try {
    // The opener (shell) receives the plain path: Windows shell APIs handle
    // long paths themselves, while the \\?\ form can break association lookup.
    await launchDetached(opener, stripLongPath(resolved));
  } catch (err) {
    throw new Error(`Failed to launch target: ${errorMessage(err)}`);
  }

  return JSON.stringify({
    target: trimmed,
    kind: stats.isDirectory() ? "directory" : "file",
    resolved: stripLongPath(resolved),
    dispatched: true,
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
