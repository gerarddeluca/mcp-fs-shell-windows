// system/handler.ts — the 6 Beledarian-parity system tools (MCP filesystem fork).
//
// Ported from the reference Beledarian toolsProvider (get_system_info,
// read_clipboard, write_clipboard, send_notification, open_file,
// preview_html) and registered under the same names with the reference
// parameter shapes and return shapes:
//
//   - get_system_info: the reference's fields verbatim ({platform, arch,
//     release, hostname, total_memory, free_memory, cpus, node_version}).
//   - read_clipboard / write_clipboard: the reference's platform branches
//     (PowerShell Get-Clipboard / Set-Clipboard on Windows, pbpaste / pbcopy
//     on macOS, xclip elsewhere), the reference's Promise.race 5-second
//     timeout, and the reference's error strings. An EMPTY clipboard reads
//     back as content "" (not an error), exactly as the reference. 
//     write_clipboard keeps the reference's base64 Set-Clipboard approach
//     (the content is base64-encoded into the PowerShell command line, so
//     quotes, newlines, and Unicode need no escaping).
//   - send_notification: node-notifier (the reference's dependency, the only
//     new one in this version) with the reference's options (title, message,
//     sound: true, wait: false), dispatched fire-and-forget; returns the
//     reference's {success: true, message}.
//   - open_file: the Beledarian-named equivalent of this fork's launch_file —
//     the same `target` parameter, the same policy, and the same internal
//     launch helper (handleLaunchFile -> launchDetached -> explorer.exe),
//     with the reference's {success: true, message} shape on success.
//   - preview_html: writes the HTML to a temp .html file in the system temp
//     dir and launches it in the default browser with the same detached
//     opener launch_file uses; returns the reference's {success, path,
//     message}. The user-supplied file_name is reduced to its last path
//     segment (the file always lands in the temp dir); when omitted the
//     reference's `preview_<timestamp>.html` default is used.
import os from "os";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import notifier from "node-notifier";
import { launchDetached, openerPath, handleLaunchFile } from "../launch_file/handler.js";

// ---------------------------------------------------------------------------
// get_system_info
// ---------------------------------------------------------------------------

/**
 * Get information about the system (OS, CPU, Memory). The reference's fields
 * verbatim: platform, arch, release, hostname, total_memory, free_memory,
 * cpus (logical CPU count), node_version.
 */
export async function handleGetSystemInfo(): Promise<string> {
  return JSON.stringify({
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    total_memory: os.totalmem(),
    free_memory: os.freemem(),
    cpus: os.cpus().length,
    node_version: process.version,
  });
}

// ---------------------------------------------------------------------------
// read_clipboard / write_clipboard
// ---------------------------------------------------------------------------

type ClipboardResult = { content?: string; success?: boolean; error?: string };

/**
 * Race a clipboard child-process op against the reference's 5-second
 * timeout (the timeout rejects; the op itself resolves with an error
 * object on failure — same settlement shape as the reference).
 */
function clipboardRace<T extends ClipboardResult>(op: () => Promise<T>): Promise<T> {
  return Promise.race<T>([
    op(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Clipboard operation timeout")), 5000)
    ),
  ]);
}

/**
 * Read text content from the system clipboard (Windows: `powershell
 * -command Get-Clipboard`, macOS: `pbpaste`, other: `xclip -selection
 * clipboard -o`). An empty clipboard yields content "" (NOT an error).
 * 5-second race timeout; a failed read or timeout yields a clear error.
 */
export async function handleReadClipboard(): Promise<string> {
  let command = "";
  let args: string[] = [];

  if (process.platform === "win32") {
    command = "powershell";
    args = ["-command", "Get-Clipboard"];
  } else if (process.platform === "darwin") {
    command = "pbpaste";
  } else {
    // Linux fallback (might fail if tools missing)
    command = "xclip";
    args = ["-selection", "clipboard", "-o"];
  }

  const result = await clipboardRace<ClipboardResult>(
    () =>
      new Promise((resolve) => {
        const child = spawn(command, args);
        let output = "";
        let error = "";

        child.stdout.on("data", (data) => (output += data.toString()));
        child.stderr.on("data", (data) => (error += data.toString()));

        child.on("close", (code) => {
          if (code === 0) {
            resolve({ content: output.trim() });
          } else {
            resolve({ error: `Failed to read clipboard. Exit code: ${code}. Error: ${error}` });
          }
        });

        child.on("error", (err) => {
          resolve({ error: `Failed to spawn clipboard command: ${err.message}` });
        });
      })
  ).catch((err): ClipboardResult => ({ error: err instanceof Error ? err.message : String(err) }));

  if (result.error) {
    throw new Error(result.error);
  }
  return JSON.stringify({ content: result.content ?? "" });
}

/**
 * Write text content to the system clipboard (Windows: the reference's
 * base64 approach — the content is UTF-8 base64-encoded into the
 * PowerShell command line and `Set-Clipboard` stores the decoded text, so
 * arbitrary text (quotes, newlines, Unicode) passes through with no
 * escaping; macOS: `pbcopy`, other: `xclip -selection clipboard -i` with
 * the content on stdin). 5-second race timeout.
 */
export async function handleWriteClipboard(content: string): Promise<string> {
  let command = "";
  let args: string[] = [];
  let input = content;

  if (process.platform === "win32") {
    command = "powershell";
    // Use base64 to avoid complex escaping issues in PowerShell
    const base64Content = Buffer.from(content, "utf8").toString("base64");
    // Command decodes base64 and sets clipboard
    args = [
      "-command",
      `$str = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Content}')); Set-Clipboard -Value $str`,
    ];
    input = ""; // Input handled via args
  } else if (process.platform === "darwin") {
    command = "pbcopy";
  } else {
    command = "xclip";
    args = ["-selection", "clipboard", "-i"];
  }

  const result = await clipboardRace<ClipboardResult>(
    () =>
      new Promise((resolve) => {
        const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });

        if (input && process.platform !== "win32") {
          child.stdin.write(input);
          child.stdin.end();
        } else if (process.platform === "win32") {
          child.stdin.end();
        }

        let error = "";
        child.stderr.on("data", (data) => (error += data.toString()));

        child.on("close", (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ error: `Failed to write to clipboard. Exit code: ${code}. Error: ${error}` });
          }
        });

        child.on("error", (err) => {
          resolve({ error: `Failed to spawn clipboard command: ${err.message}` });
        });
      })
  ).catch((err): ClipboardResult => ({ error: err instanceof Error ? err.message : String(err) }));

  if (result.error) {
    throw new Error(result.error);
  }
  return JSON.stringify({ success: true });
}

// ---------------------------------------------------------------------------
// send_notification
// ---------------------------------------------------------------------------

/**
 * Send a system notification to the user. node-notifier picks the platform
 * backend (on Windows: the bundled snoretoast WinRT toast; a balloon via
 * notifu as fallback) — dispatch is fire-and-forget exactly as the
 * reference, which passes the reference's options (title, message,
 * sound: true, wait: false) and returns success immediately. The `sound`
 * option is part of the reference call but not in the DefinitelyTyped
 * declaration, so the options object is cast to the notify() parameter
 * type to keep the reference call verbatim.
 */
export async function handleSendNotification(title: string, message: string): Promise<string> {
  type NotifierOptions = Parameters<typeof notifier.notify>[0];
  notifier.notify({
    title: title,
    message: message,
    sound: true,
    wait: false,
  } as NotifierOptions);
  return JSON.stringify({ success: true, message: "Notification sent." });
}

// ---------------------------------------------------------------------------
// open_file
// ---------------------------------------------------------------------------

/**
 * Open a file, folder, or http(s) URL in the OS default app. The
 * Beledarian-named equivalent of launch_file: same `target` parameter and
 * same policy, delegating to the exact same internal launch helper chain
 * (handleLaunchFile -> launchDetached -> explorer.exe), with the
 * reference's success shape. Errors (unsupported URL scheme, path outside
 * the allowed roots, missing file, failed opener spawn) propagate from
 * handleLaunchFile as clear thrown errors.
 */
export async function handleOpenFile(
  target: string,
  allowedDirectories: string[]
): Promise<string> {
  await handleLaunchFile(target, allowedDirectories);
  return JSON.stringify({
    success: true,
    message: `Opened ${(target ?? "").trim()}`,
  });
}

// ---------------------------------------------------------------------------
// preview_html
// ---------------------------------------------------------------------------

/**
 * Render and preview HTML content in the system's default browser. Writes
 * the content to a temp .html file in the system temp dir and launches it
 * with the same detached opener launch_file uses. The user-supplied
 * file_name is reduced to its last path segment (the file always lands in
 * the temp dir; an existing file of that name is overwritten); when
 * omitted, the reference's `preview_<timestamp>.html` default is used.
 * The temp file is left on disk and its path is returned.
 */
export async function handlePreviewHtml(
  htmlContent: string,
  fileName?: string
): Promise<string> {
  const name = path.basename((fileName && fileName.trim()) || `preview_${Date.now()}.html`);
  const filePath = path.join(os.tmpdir(), name);
  await fs.writeFile(filePath, htmlContent, "utf-8");

  try {
    await launchDetached(openerPath(), filePath);
  } catch (err) {
    throw new Error(`Failed to launch preview: ${err instanceof Error ? err.message : String(err)}`);
  }

  return JSON.stringify({
    success: true,
    path: filePath,
    message: "HTML preview launched in browser.",
  });
}
