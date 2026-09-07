import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";
import { createUnifiedDiff, normalizeLineEndings } from "../helpers/diff.js";
import { detectDominantEol, fromLf } from "../patch_files/helpers.js";

interface ComputedEntry {
  requestedPath: string;
  resolvedPath: string;
  matches: number;
  preview?: string;
  writeText: string;
}

// Ensure the 'g' (global) flag is present in the flag set (deduplicated) and
// add it if the caller omitted it, so that every match is replaced. Caller
// flags such as 'i' are preserved.
function withGlobalFlag(flags: string): string {
  const set = new Set<string>();
  for (const ch of flags || "") set.add(ch);
  set.add("g");
  return Array.from(set).join("");
}

export async function handleReplaceRegex(
  paths: string[],
  pattern: string,
  replacement: string,
  flags: string,
  dryRun: boolean,
  allowedDirectories: string[]
): Promise<string> {
  const effectiveFlags = withGlobalFlag(flags || "");

  // Validate the regex up front. If it is invalid (bad pattern or bad flags),
  // throw so that NOTHING is written for this call.
  try {
    new RegExp(pattern, effectiveFlags);
  } catch (error) {
    throw new Error(
      `Invalid regular expression "${pattern}" (flags "${effectiveFlags}"): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Phase 1: validate every path and compute all results WITHOUT writing.
  // Any missing path, directory, or unreadable file throws, so NOTHING is
  // written for the whole call (all-or-nothing). Writes happen only in Phase 2,
  // after this loop completes successfully.
  const computed: ComputedEntry[] = [];
  let totalReplacements = 0;

  for (const requestedPath of paths) {
    const resolvedPath = await validatePath(requestedPath, allowedDirectories);

    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new Error(`Path not found: ${requestedPath}`);
    }
    if (stat.isDirectory()) {
      throw new Error(
        `Directory not accepted: ${requestedPath}. replace_regex operates on files only - list the specific file path(s) to change.`
      );
    }
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${requestedPath}`);
    }

    const raw = await fs.readFile(resolvedPath, "utf-8");
    const eol = detectDominantEol(raw);
    // Run the replacement in LF-normalized space, then restore the file's
    // dominant line ending on write so a pure-CRLF file stays fully CRLF
    // (byte-level; no mixed endings). Same approach as patch_files.
    const content = normalizeLineEndings(raw);

    // Count matches (fresh global regex; advance on zero-length matches to
    // avoid an infinite loop, mirroring search_regex).
    const countRegex = new RegExp(pattern, effectiveFlags);
    let matches = 0;
    let m: RegExpExecArray | null;
    while ((m = countRegex.exec(content)) !== null) {
      matches++;
      if (m[0].length === 0) countRegex.lastIndex++;
    }

    // Perform the replacement (fresh global regex; $1/${name}/$&/$' etc. are
    // handled by the engine). The count of matches equals the number of
    // replacements for a global pattern.
    const replaceRegex = new RegExp(pattern, effectiveFlags);
    const newContent = content.replace(replaceRegex, replacement);

    totalReplacements += matches;

    const entry: ComputedEntry = {
      requestedPath,
      resolvedPath,
      matches,
      writeText: fromLf(newContent, eol),
    };

    if (dryRun) {
      entry.preview =
        matches === 0
          ? "(no matches - no change)"
          : createUnifiedDiff(content, newContent, requestedPath, requestedPath);
    }

    computed.push(entry);
  }

  // Phase 2: apply writes (only when not a dry run). All Phase-1 computation
  // above has already succeeded, so every file can be written safely.
  if (!dryRun) {
    for (const entry of computed) {
      await fs.writeFile(entry.resolvedPath, entry.writeText, "utf-8");
    }
  }

  // Build the text output.
  const mode = dryRun
    ? "Dry run (preview only - NO files were written)"
    : "Applied (files written in place)";
  let output = `${mode}: ${computed.length} file(s), ${totalReplacements} replacement(s) total.\n`;

  for (const entry of computed) {
    output += `\nFile: ${entry.requestedPath}\n`;
    output += `  matches: ${entry.matches}\n`;
    if (dryRun && entry.preview !== undefined) {
      output += `  preview:\n${entry.preview}\n`;
    }
  }

  if (dryRun) {
    output += `\n(No changes were written. Re-run with dryRun=false to apply.)`;
  }

  return output;
}
