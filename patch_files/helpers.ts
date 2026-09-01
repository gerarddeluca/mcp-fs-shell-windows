import fs from "fs/promises";
import { createUnifiedDiff, normalizeLineEndings } from "../helpers/diff.js";

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
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, "utf-8"));

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
  const diff = createUnifiedDiff(content, modifiedContent, filePath, filePath);

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
    await fs.writeFile(filePath, modifiedContent, "utf-8");
  }

  return resultText;
}
