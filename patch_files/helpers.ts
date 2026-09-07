import fs from "fs/promises";
import { createUnifiedDiff, normalizeLineEndings } from "../helpers/diff.js";
import { stripLongPath } from "../helpers/path.js";

// Detect the dominant line ending of the raw file content so it can be
// restored on write (mirrors the edit_files approach). CRLF is chosen only
// when it is the strict majority of the file's newlines; otherwise the file
// is treated as LF (also the outcome for a CRLF/LF tie, matching the
// previous LF-normalizing default).
export function detectDominantEol(text: string): string {
  const crlf = (text.match(/\r\n/g) || []).length;
  const others = (text.replace(/\r\n/g, "").match(/[\r\n]/g) || []).length;
  return crlf > others ? "\r\n" : "\n";
}

// Re-apply the dominant line ending to LF-normalized content (no-op for LF).
export function fromLf(text: string, eol: string): string {
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

export interface PatchOptions {
  preserveIndentation: boolean;
}

export type PatchAction = "replace" | "insertBefore" | "delete";

export interface PatchEntry {
  startLine: number;
  endLine: number;
  newText: string;
  action?: PatchAction;
}

export async function applyFilePatches(
  filePath: string,
  patches: PatchEntry[],
  dryRun: boolean = false,
  options: PatchOptions = { preserveIndentation: true }
): Promise<string> {
  // Read the raw file, detect its dominant line ending, and normalize to LF
  // for patching. The dominant ending is restored on write so the file keeps
  // its original EOL convention.
  const raw = await fs.readFile(filePath, "utf-8");
  const eol = detectDominantEol(raw);
  const content = normalizeLineEndings(raw);

  // Split content into lines
  const contentLines = content.split("\n");

  // Sort patches by line number in descending order so every patch references
  // the original line numbers (earlier lines keep their positions).
  const sortedPatches = [...patches].sort((a, b) => b.startLine - a.startLine);

  // Apply patches sequentially
  let modifiedContentLines = [...contentLines];
  const patchResults: Array<{
    patch: PatchEntry;
    applied: boolean;
    message?: string;
  }> = [];

  for (const patch of sortedPatches) {
    const { startLine, endLine, newText } = patch;
    const action: PatchAction = patch.action ?? "replace";
    const patchResult: {
      patch: PatchEntry;
      applied: boolean;
      message?: string;
    } = { patch, applied: false };

    if (action === "insertBefore") {
      // Insert newText before startLine (1 = before the first line;
      // contentLines.length + 1 = append after the last line).
      if (startLine < 1 || startLine > contentLines.length + 1) {
        patchResult.message = `Invalid insert position: ${startLine} (file has ${contentLines.length} lines; valid positions 1-${contentLines.length + 1})`;
        patchResults.push(patchResult);
        throw new Error(patchResult.message);
      }

      const normalizedNew = normalizeLineEndings(newText);
      let newLines = normalizedNew.split("\n");

      if (options.preserveIndentation && newText.length > 0) {
        // Detect indentation from the line being inserted before
        const refIndex = Math.min(startLine - 1, contentLines.length - 1);
        const originalIndent = modifiedContentLines[refIndex]?.match(/^\s*/)?.[0] || "";

        newLines = newLines.map((line, idx) => {
          if (idx === 0) return originalIndent + line.trimStart();
          return line;
        });
      }

      modifiedContentLines.splice(startLine - 1, 0, ...newLines);
    } else if (action === "delete") {
      // Remove lines startLine-endLine entirely
      if (startLine < 1 || endLine < startLine || endLine > contentLines.length) {
        patchResult.message = `Invalid line range: ${startLine}-${endLine} (file has ${contentLines.length} lines)`;
        patchResults.push(patchResult);
        throw new Error(patchResult.message);
      }

      modifiedContentLines.splice(startLine - 1, endLine - startLine + 1);
    } else {
      // replace (default): original behavior
      if (startLine < 1 || endLine < startLine || endLine > contentLines.length) {
        patchResult.message = `Invalid line range: ${startLine}-${endLine} (file has ${contentLines.length} lines)`;
        patchResults.push(patchResult);
        throw new Error(patchResult.message);
      }

      const normalizedNew = normalizeLineEndings(newText);
      const newLines = normalizedNew.split("\n");

      if (options.preserveIndentation) {
        // Detect indentation from the first line being replaced
        const originalIndent = modifiedContentLines[startLine - 1].match(/^\s*/)?.[0] || "";

        // Apply indentation to new lines
        const indentedNewLines = newLines.map((line, idx) => {
          if (idx === 0) return originalIndent + line.trimStart();
          return line;
        });

        // Replace lines
        modifiedContentLines.splice(startLine - 1, endLine - startLine + 1, ...indentedNewLines);
      } else {
        // Replace lines without preserving indentation
        modifiedContentLines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
      }
    }

    patchResult.applied = true;
    patchResults.push(patchResult);
  }

  const modifiedContent = modifiedContentLines.join("\n");

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, stripLongPath(filePath), stripLongPath(filePath));

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }

  // Build result with detailed information
  let resultText = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  // Add patch details
  resultText += "Patch details:\n";
  patchResults.forEach((result, i) => {
    const { startLine, endLine } = result.patch;
    const action = result.patch.action ?? "replace";
    const range = action === "insertBefore" ? `before line ${startLine}` : `lines ${startLine}-${endLine}`;
    resultText += `Patch ${i + 1}: ${result.applied ? "APPLIED" : "FAILED"} (${action}, ${range})\n`;
    if (result.message) {
      resultText += `  Message: ${result.message}\n`;
    }
  });

  if (!dryRun) {
    // Write back with the file's original dominant line ending.
    await fs.writeFile(filePath, fromLf(modifiedContent, eol), "utf-8");
  }

  return resultText;
}
