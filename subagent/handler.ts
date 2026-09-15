// subagent/handler.ts — consult_secondary_agent (MCP filesystem fork).
//
// Port of the Beledarian reference implementation (beledarians-lm-studio-tools
// src/toolsProvider.ts L2465-3236): a delegated agent loop against the
// LM Studio /v1/chat/completions endpoint (default http://localhost:1234/v1,
// model "local-model" = the main loaded model). It parses JSON tool calls out
// of prose (subAgentToolCallParser.ts), validates them (toolCallValidator.ts),
// executes them against the FORK's own in-process handlers (no JSON-RPC
// round-trip), auto-saves code blocks from the FINAL response, runs the
// auto-debug reviewer pass when the primary task modified files, and returns:
//
//   { response, generated_files, filesModified, handoff_message? }
// or
//   { error, filesModified? }
//
// Environment overrides:
//   MCP_SUBAGENT_ENDPOINT  default http://localhost:1234/v1
//   MCP_SUBAGENT_MODEL     default local-model
//   MCP_SUBAGENT_CWD       sub-agent working dir (default: process.cwd())
//   MCP_SUBAGENT_PROFILES  JSON string {role: personaText} (default: built-ins)
//   MCP_SUBAGENT_DEBUG     "1" to enable [Sub-Agent] console logging
//
// Auth: Bearer token from the LM Studio API token file when present (keyless
// fallback when missing) — replicates the patched Beledarian behavior.
//
// Allowed-tool mapping (allow_tools=true) -> fork in-process handlers:
//   read_file                     -> read_files
//   list_directory                -> list_directory
//   save_file                     -> write_new_files (overwrite semantics)
//   replace_text_in_file          -> edit_files (replaceAll: false)
//   delete_files_by_pattern       -> delete_files_by_pattern
//   rag_local_files               -> rag_local_files
//   fuzzy_find_local_files        -> fuzzy_find_files
//   search_file_content           -> search_regex
//   wikipedia_search              -> wikipedia_search
//   web_search / duckduckgo_search-> web_search
//   fetch_web_content             -> fetch_web_content
//   rag_web_content               -> rag_web_content
//   browser_session_open/control/close -> same names
//   run_python                    -> run_python (in the sub-agent CWD)
//   run_javascript                -> run_javascript
//   finish_task                   -> termination signal (loop exit, no execution)

import { readFile, writeFile, appendFile, stat, mkdir, readdir } from "fs/promises";
import { join, dirname, resolve, relative, isAbsolute } from "path";

import {
  parseSubAgentResponseMessage,
  type ParsedToolCall,
} from "./subAgentToolCallParser.js";
import { validateToolCall } from "./toolCallValidator.js";
import { extractHandoffMessage } from "./handoffMessage.js";

// The FORK's own in-process handlers (executed directly; no JSON-RPC round-trip)
import { handleReadFiles } from "../read_files/handler.js";
import { handleListDirectory } from "../list_directory/handler.js";
import { handleWriteNewFiles } from "../write_new_files/handler.js";
import { handleEditFiles } from "../edit_files/handler.js";
import { handleDeleteFilesByPattern } from "../delete_files_by_pattern/handler.js";
import { handleRagLocalFiles, handleRagWebContent } from "../rag/handler.js";
import { handleFuzzyFindFiles } from "../fuzzy_find_files/handler.js";
import { handleSearchRegex } from "../search_regex/handler.js";
import {
  handleWebSearch,
  handleFetchWebContent,
  handleWikipediaSearch,
} from "../web/handler.js";
import {
  handleBrowserSessionOpen,
  handleBrowserSessionControl,
  handleBrowserSessionClose,
} from "../browser/handler.js";
import { handleRunPython, handleRunJavascript } from "../compat/handler.js";

// --- Security Helper (ported from the reference L20-30) ---
function validatePath(baseDir: string, requestedPath: string): string {
  const resolved = resolve(baseDir, requestedPath);

  // Use relative pathing to ensure the resolved path stays within baseDir
  const rel = relative(baseDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Access Denied: Path '${requestedPath}' is outside the workspace.`);
  }

  return resolved;
}

// (ported from the reference L32-62)
function extractLikelyFilePath(text: string): string | null {
  const isPlausiblePath = (value: string): boolean => {
    const candidate = value.trim();
    if (!candidate) return false;
    if (/[\r\n]/.test(candidate)) return false;
    if (candidate.includes("=") && !candidate.includes("\\") && !candidate.includes("/")) return false;
    if (/[<>|*?]/.test(candidate)) return false;

    const extensionMatch = candidate.match(/\.([A-Za-z0-9_-]{1,15})$/);
    if (!extensionMatch) return false;
    const extension = extensionMatch[1];
    if (!/[A-Za-z]/.test(extension)) return false; // reject ".0" and similar numeric pseudo-extensions

    return true;
  };

  const patterns = [
    /['"]([A-Za-z]:\\[^'"\r\n]+)['"]/,
    /\b([A-Za-z]:\\[^\s'"]+(?:\.[A-Za-z0-9_-]+)?)\b/,
    /['"]((?:\.{0,2}[\\/])?[^'"\r\n]+\.[A-Za-z0-9_-]+)['"]/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].replace(/[),.;]+$/, "").trim();
    if (!isPlausiblePath(candidate)) continue;
    return candidate;
  }
  return null;
}

// LM Studio API token file (2026-09-04 auth enablement). When the file exists,
// requests carry an Authorization: Bearer header; otherwise keyless (works
// when auth is off). Same file + fallback the patched Beledarian plugin uses.
const API_TOKEN_FILE =
  "C:\\Users\\Gerar\\.beledarians-llm-toolbox\\workspace\\overnight\\lm_api_token.txt";

// Built-in persona profiles:
//  - 'summarizer'/'coder': the reference's config default (subAgentProfiles,
//    beledarians config.ts L148)
//  - 'reviewer': the reference's inline fallback persona (toolsProvider L2547)
const BUILT_IN_PROFILES: Record<string, string> = {
  summarizer: "You are a summarization expert. Summarize the content concisely.",
  coder: "You are a software engineer. Write efficient and safe code.",
  reviewer:
    "You are a Senior Code Reviewer. Your job is to analyze code, find bugs, security issues, or logic errors, and FIX them.\n\nIMPORTANT: To fix a file, you MUST use the 'save_file' tool with the complete, corrected content. DO NOT use 'container.exec' or diff formats. Just overwrite the file with the fixed version using 'save_file'.",
};

// Full allowed-tools set for the fork: the reference gates these behind
// subAgentAllowFileSystem / subAgentAllowWeb / subAgentAllowCode /
// subAgentAllowBrowserControl settings (all on except code/browser by
// default). The fork has no settings UI, so allow_tools=true enables the
// full mapped set below.
const FULL_ALLOWED_TOOLS = [
  "read_file", "list_directory", "save_file", "replace_text_in_file",
  "delete_files_by_pattern", "rag_local_files", "fuzzy_find_local_files",
  "search_file_content",
  "wikipedia_search", "web_search", "duckduckgo_search",
  "fetch_web_content", "rag_web_content",
  "browser_session_open", "browser_session_control", "browser_session_close",
  "run_python", "run_javascript",
];

type SubAgentLoopResult = {
  response?: string;
  error?: string;
  filesModified: string[];
  handoff_message?: string;
};

type SubAgentMsg = { role: "system" | "user" | "assistant"; content: string };

export async function handleConsultSecondaryAgent(
  task: string,
  agentRole: string | undefined,
  context: string | undefined,
  allowTools: boolean | undefined,
  allowedDirectories: string[]
): Promise<string> {
  let endpoint = process.env.MCP_SUBAGENT_ENDPOINT || "http://localhost:1234/v1";
  let modelId = process.env.MCP_SUBAGENT_MODEL || "local-model";
  let handoffMessage: string | undefined = undefined;
  let finalResponse = "";

  const subAgentDebugLogging = process.env.MCP_SUBAGENT_DEBUG === "1";

  // Sub-agent working directory (reference: plugin-state currentWorkingDirectory)
  const currentWorkingDirectory = process.env.MCP_SUBAGENT_CWD || process.cwd();

  // Persona profiles: env JSON override, else built-in defaults
  let subAgentProfiles: Record<string, string> = { ...BUILT_IN_PROFILES };
  const profilesEnv = process.env.MCP_SUBAGENT_PROFILES;
  if (profilesEnv && profilesEnv.trim()) {
    try {
      const parsed = JSON.parse(profilesEnv);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        subAgentProfiles = parsed as Record<string, string>;
      }
    } catch { /* invalid JSON - keep built-ins */ }
  }

  // The fork has no settings UI; use the reference's config defaults:
  // subAgentAutoSave=true, showFullCodeOutput=false. (The reference's
  // enableDebugMode=false default is overridden here: the auto-debug
  // reviewer pass runs for coding tasks, i.e. whenever the primary task
  // modified files.)
  const autoSave = true;
  const showFullCode = false;

  // LM Studio API auth (enabled 2026-09-04): send an Authorization header when
  // the token file exists; otherwise stay keyless (works when auth is off).
  let apiToken = "";
  try {
    const t = await readFile(API_TOKEN_FILE, "utf-8");
    if (t.trim()) apiToken = t.trim();
  } catch { /* no token file - keyless mode */ }

  const maxSubAgentToolOutputChars = 30000;
  const truncateOutput = (s: string): string =>
    s.length > maxSubAgentToolOutputChars
      ? `${s.substring(0, maxSubAgentToolOutputChars)}\n... (truncated ${s.length - maxSubAgentToolOutputChars} chars)`
      : s;

  // Helper to run an agent loop (ported from the reference runAgentLoop)
  const runAgentLoop = async (
    role: string,
    taskPrompt: string,
    contextData: string,
    loopLimit: number = 8,
    forceTools: boolean = false
  ): Promise<SubAgentLoopResult> => {
    let currentSystemPrompt = "You are a helpful assistant.";

    // Load Instructions
    const instructionsPath = join(currentWorkingDirectory, "SUB_AGENT_INSTRUCTIONS.md");
    try {
      const instructions = await readFile(instructionsPath, "utf-8");
      if (instructions.trim()) currentSystemPrompt = instructions;
    } catch { /* Ignore if instructions file doesn't exist */ }

    // Inject Project Info
    const infoPath = join(currentWorkingDirectory, "beledarian_info.md");
    try {
      const projectInfo = await readFile(infoPath, "utf-8");
      if (projectInfo.trim()) {
        currentSystemPrompt += `\n\n## ? Current Project Info (beledarian_info.md)\n${projectInfo}\n`;
      }
    } catch { /* Ignore if info file doesn't exist */ }

    // Add current working directory to system prompt for context
    currentSystemPrompt += `\n\n## ? Current Workspace\nYour current working directory is: \n\n${currentWorkingDirectory}\nAlways assume relative paths are from this directory.`;

    // Append specific profile if available
    try {
      if (subAgentProfiles[role]) {
        currentSystemPrompt += `\n\n## Your Persona\n${subAgentProfiles[role]}`;
      }
    } catch { /* ignore */ }

    // Append Tools
    let toolsReminder = "";
    const toolsEnabled = allowTools || forceTools;
    if (toolsEnabled) {
      const toolsList = FULL_ALLOWED_TOOLS.join(", ");
      currentSystemPrompt += `\n\n## Allowed Tools\nYou have access to the following tools via JSON output: ${toolsList}.\nRefer to the "Tool Usage" section above for the JSON format.\n`;
      toolsReminder = `\n\n[SYSTEM REMINDER: You have access to tools: ${toolsList}. If you need information you don't have, USE A TOOL. Do not refuse. Format tool calls exactly as: {"tool": "tool_name", "args": {"arg_name": "value"}}]`;
      currentSystemPrompt += `\n\n## Browser Navigation Rule\nFor multi-step browsing/navigation, you MUST use browser_session_open -> browser_session_control -> browser_session_close.\nUse browser_open_page only for one-shot page reads.`;
    }

    currentSystemPrompt += `\n\n## Optional Handoff Message\nIf you want the main agent to relay your findings, include either:\n1) [HANDOFF_MESSAGE]...[/HANDOFF_MESSAGE]\nOR\n2) JSON with a \`handoff_message\` field (optionally with \`response\` or \`final_response\`).`;

    currentSystemPrompt += `\n\n## Task Completion & Early Exit\nIf you have successfully completed your task, output 'TASK_COMPLETED'.\nIf you cannot complete the task (e.g., due to system limitations, missing files, or inaccessible paths), output 'TASK_FAILED' to abort early.`;

    const msgList: SubAgentMsg[] = [
      { role: "system", content: currentSystemPrompt },
      { role: "user", content: `Task: ${taskPrompt}\n\nContext: ${contextData}${toolsReminder}` },
    ];

    let loops = 0;
    let noToolCallCount = 0;
    let executedToolCallCount = 0;
    let finalContent = "";
    let filesModified: string[] = [];
    let handoffMessage = "";
    const suggestedReadPath = toolsEnabled
      ? extractLikelyFilePath(`${taskPrompt}\n${contextData}`)
      : null;

    while (loops < loopLimit) {
      try {
        const subAgentHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (apiToken) subAgentHeaders["Authorization"] = `Bearer ${apiToken}`;
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: subAgentHeaders,
          body: JSON.stringify({
            model: modelId,
            messages: msgList,
            temperature: 0.7,
            stream: false
          })
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          const compactErrorBody = errorBody.replace(/\s+/g, " ").trim().substring(0, 600);
          if (subAgentDebugLogging) {
            console.log(`[Sub-Agent] API error status=${response.status} body=${compactErrorBody}`);
          }
          const details = compactErrorBody ? ` - ${compactErrorBody}` : "";
          return { error: `API Error: ${response.status}${details}`, filesModified };
        }

        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        const parsedMessage = parseSubAgentResponseMessage(message);
        const content = parsedMessage.content;
        let toolCall: ParsedToolCall | null = parsedMessage.toolCall;

        if (subAgentDebugLogging) {
          const rawContent = (typeof message === "string" ? message : JSON.stringify(message)) ?? "";
          console.log(`[Sub-Agent] RAW content received: ${rawContent.substring(0, 1000)}...`);
          const preview = content.substring(0, 200);
          console.log(`[Sub-Agent] Parse result source=${parsedMessage.toolCallSource} hasToolCall=${Boolean(toolCall)} preview=${preview}`);
        }

        // Always capture the latest content as the finalContent candidate
        finalContent = content;

        if (!toolsEnabled) {
          const extracted = extractHandoffMessage(content);
          // If the only output is a bare tool-call JSON (model tried to use tools it wasn't
          // given), substitute a clear failure message rather than leaking raw JSON.
          const looksLikePureToolCall =
            extracted.response.trimStart().startsWith("{") &&
            parsedMessage.toolCall !== null &&
            extracted.response.trim().length < 500;
          const safeResponse = looksLikePureToolCall
            ? "[Sub-agent did not produce a prose response. It attempted a tool call but tools are disabled for this invocation.]"
            : extracted.response;
          return { response: safeResponse, filesModified, handoff_message: extracted.handoffMessage };
        }

        const trimmed = content.trim();
        if (!toolCall && trimmed) {
          const refusalKeywords = [
            "i cannot browse", "i don't have access", "i can't access",
            "unable to browse", "real-time news", "no internet access",
            "as an ai", "i do not have the ability", "cannot access the internet"
          ];
          if (refusalKeywords.some(kw => trimmed.toLowerCase().includes(kw))) {
            msgList.push({ role: "assistant", content: content });
            // role must stay "user": mid-conversation "system" messages break chat templates
            // that require the system message first (e.g. HauhauCS Qwen templates raise)
            msgList.push({ role: "user", content: "SYSTEM ERROR: You HAVE access to tools. USE THEM." });
            loops++;
            continue;
          }
        }

        if (toolCall && toolCall.tool) {
          noToolCallCount = 0;
          executedToolCallCount++;
          msgList.push({ role: "assistant", content: content });
          let toolResult = "";
          let finishNow = false;

          const args = toolCall.args || {};

          // Use shared validator to prevent duplication between prod and tests
          const toolValidationError = validateToolCall(toolCall.tool, args);

          if (toolValidationError) {
            toolResult = `TOOL_VALIDATION_ERROR: ${toolValidationError}`;
          } else {
            try {
              // --- File System (fork handler mappings) ---
              if (toolCall.tool === "read_file" && toolCall.args?.file_name) {
                const fpath = validatePath(currentWorkingDirectory, toolCall.args.file_name);
                const readContent = await handleReadFiles([fpath], allowedDirectories);
                toolResult = truncateOutput(readContent);
              } else if (toolCall.tool === "list_directory") {
                const dirPath = toolCall.args?.path
                  ? validatePath(currentWorkingDirectory, toolCall.args.path)
                  : currentWorkingDirectory;
                toolResult = truncateOutput(await handleListDirectory(dirPath, allowedDirectories));
              } else if (toolCall.tool === "save_file") {
                // Handle batch files (some models return { files: [...] })
                if (Array.isArray(toolCall.args?.files)) {
                  const fileEntries: Array<{ path: string; content: string; overwrite: boolean }> = [];
                  for (const fileObj of toolCall.args.files) {
                    const fName = fileObj.file_name || fileObj.name || fileObj.path;
                    const fContent = fileObj.content || fileObj.data;
                    if (fName && fContent) {
                      const fpath = validatePath(currentWorkingDirectory, fName);
                      fileEntries.push({ path: fpath, content: fContent, overwrite: true });
                    }
                  }
                  if (fileEntries.length > 0) {
                    const res = await handleWriteNewFiles(fileEntries, allowedDirectories);
                    const savedList = fileEntries
                      .filter((f) => res.includes(`Successfully wrote to ${f.path}`))
                      .map((f) => {
                        const relName = relative(currentWorkingDirectory, f.path);
                        return relName.startsWith("..") || isAbsolute(relName) ? f.path : relName;
                      });
                    for (const name of savedList) filesModified.push(name);
                    toolResult = savedList.length > 0
                      ? `Success: Saved ${savedList.length} files: ${savedList.join(", ")}`
                      : `Error: No valid files found in batch.\n${res}`;
                  } else {
                    toolResult = "Error: No valid files found in batch.";
                  }
                } else {
                  // Handle varying argument names (some models use name/data instead of file_name/content)
                  const fileName = toolCall.args?.file_name || toolCall.args?.name || toolCall.args?.path;
                  const content = toolCall.args?.content || toolCall.args?.data;

                  if (fileName && content) {
                    const fpath = validatePath(currentWorkingDirectory, fileName);
                    const res = await handleWriteNewFiles(
                      [{ path: fpath, content, overwrite: true }],
                      allowedDirectories
                    );
                    if (res.includes(`Successfully wrote to ${fpath}`)) {
                      toolResult = `Success: File saved to ${fpath}`;
                      filesModified.push(fileName);
                    } else {
                      toolResult = `Error: ${res}`;
                    }
                  } else {
                    toolResult = "Error: Missing 'file_name' (or 'name', 'path') or 'content' (or 'data') arguments.";
                  }
                }
              } else if (toolCall.tool === "replace_text_in_file" && toolCall.args?.file_name && toolCall.args?.old_string && toolCall.args?.new_string) {
                const fpath = validatePath(currentWorkingDirectory, toolCall.args.file_name);
                const res = await handleEditFiles(
                  [{
                    path: fpath,
                    edits: [{
                      oldString: toolCall.args.old_string,
                      newString: toolCall.args.new_string,
                      replaceAll: false,
                    }],
                  }],
                  allowedDirectories
                );
                if (res.includes("1 files edited successfully")) {
                  toolResult = "Success: Text replaced.";
                  filesModified.push(toolCall.args.file_name);
                } else {
                  toolResult = `Error: ${res}`;
                }
              } else if (toolCall.tool === "delete_files_by_pattern" && toolCall.args?.pattern) {
                if (toolCall.args.pattern.length > 100) throw new Error("Pattern too complex");
                const regex = new RegExp(toolCall.args.pattern);

                // ReDoS check
                const start = Date.now();
                regex.test("safe_test_string_for_redos_check_1234567890_safe_test_string_for_redos_check_1234567890");
                if (Date.now() - start > 100) throw new Error("Pattern too complex/slow");

                toolResult = truncateOutput(
                  await handleDeleteFilesByPattern(
                    currentWorkingDirectory,
                    toolCall.args.pattern,
                    toolCall.args?.include_directories === true,
                    allowedDirectories
                  )
                );
              } else if (toolCall.tool === "rag_local_files") {
                if (toolCall.args?.query) {
                  toolResult = truncateOutput(
                    await handleRagLocalFiles(
                      toolCall.args.query,
                      toolCall.args?.path,
                      toolCall.args?.file_pattern,
                      allowedDirectories
                    )
                  );
                } else {
                  toolResult = "Error: 'query' is required.";
                }
              } else if (toolCall.tool === "fuzzy_find_local_files" && toolCall.args?.query) {
                const targetDir = toolCall.args?.path
                  ? validatePath(currentWorkingDirectory, toolCall.args.path)
                  : currentWorkingDirectory;
                const maxResults = Math.min(Math.max(Number(toolCall.args?.max_results ?? 5), 1), 20);
                const scanLimit = Math.min(Math.max(Number(toolCall.args?.scan_limit ?? 20000), 1), 200000);
                toolResult = truncateOutput(
                  await handleFuzzyFindFiles(
                    toolCall.args.query,
                    targetDir,
                    toolCall.args?.recursive !== false,
                    maxResults,
                    scanLimit,
                    allowedDirectories
                  )
                );
              } else if (toolCall.tool === "search_file_content" && toolCall.args?.pattern) {
                const targetPath = toolCall.args?.path
                  ? validatePath(currentWorkingDirectory, toolCall.args.path)
                  : currentWorkingDirectory;
                const maxResults = Math.min(Math.max(Number(toolCall.args?.max_results ?? 100), 1), 500);
                toolResult = truncateOutput(
                  await handleSearchRegex(
                    targetPath,
                    toolCall.args.pattern,
                    Array.isArray(toolCall.args?.file_patterns) ? toolCall.args.file_patterns : [],
                    Array.isArray(toolCall.args?.exclude_patterns) ? toolCall.args.exclude_patterns : [],
                    maxResults,
                    toolCall.args?.case_sensitive === true,
                    1,
                    allowedDirectories,
                    toolCall.args?.count_only === true
                  )
                );

              // --- Web (fork handler mappings) ---
              } else if (toolCall.tool === "wikipedia_search" && toolCall.args?.query) {
                toolResult = truncateOutput(
                  await handleWikipediaSearch(toolCall.args.query, toolCall.args?.lang || "en")
                );
              } else if (toolCall.tool === "web_search" || toolCall.tool === "duckduckgo_search") {
                if (toolCall.args?.query) {
                  toolResult = truncateOutput(await handleWebSearch(toolCall.args.query));
                } else {
                  toolResult = "Error: 'query' is required.";
                }
              } else if (toolCall.tool === "fetch_web_content" && toolCall.args?.url) {
                toolResult = truncateOutput(await handleFetchWebContent(toolCall.args.url));
              } else if (toolCall.tool === "rag_web_content" && toolCall.args?.url && toolCall.args?.query) {
                toolResult = truncateOutput(await handleRagWebContent(toolCall.args.url, toolCall.args.query));

              // --- Browser (fork handler mappings) ---
              } else if (toolCall.tool === "browser_session_open" && toolCall.args?.url) {
                toolResult = truncateOutput(
                  await handleBrowserSessionOpen(
                    toolCall.args.url,
                    toolCall.args?.wait_for_selector,
                    toolCall.args?.include_page_text
                  )
                );
              } else if (toolCall.tool === "browser_session_control") {
                toolResult = truncateOutput(
                  await handleBrowserSessionControl(toolCall.args ?? {}, allowedDirectories)
                );
              } else if (toolCall.tool === "browser_session_close") {
                toolResult = truncateOutput(await handleBrowserSessionClose());

              // --- Code (fork handler mappings) ---
              } else if (toolCall.tool === "run_python" && toolCall.args?.python) {
                toolResult = truncateOutput(
                  await handleRunPython(toolCall.args.python, toolCall.args?.timeout_seconds, currentWorkingDirectory)
                );
              } else if (toolCall.tool === "run_javascript" && toolCall.args?.javascript) {
                toolResult = truncateOutput(
                  await handleRunJavascript(toolCall.args.javascript, toolCall.args?.timeout_seconds)
                );

              // finish_task: termination signal, not an executable tool (the
              // reference's validator special-cases it; the loop exits cleanly)
              } else if (toolCall.tool === "finish_task") {
                if (toolCall.args?.message && !finalContent) {
                  finalContent = String(toolCall.args.message);
                }
                finishNow = true;
              }

              if (!toolResult) toolResult = "Error: Tool not found/allowed.";
            } catch (err: any) {
              toolResult = `Error: ${err.message}`;
            }
          }

          if (finishNow) break;

          msgList.push({ role: "user", content: `Tool Output: ${toolResult}` });
          loops++;
        } else {
          // NO TOOL CALL DETECTED
          const shouldAutoFallbackRead =
            toolsEnabled &&
            executedToolCallCount === 0 &&
            noToolCallCount === 0 &&
            typeof suggestedReadPath === "string" &&
            suggestedReadPath.length > 0;

          if (shouldAutoFallbackRead) {
            try {
              const autoReadPath = validatePath(currentWorkingDirectory, suggestedReadPath);
              const autoReadStats = await stat(autoReadPath);
              if (!autoReadStats.isFile()) {
                throw new Error(`Not a file: ${autoReadPath}`);
              }
              const autoReadContent = await readFile(autoReadPath, "utf-8");
              const boundedContent = autoReadContent.length > 30000
                ? `${autoReadContent.substring(0, 30000)}\n... (truncated)`
                : autoReadContent;

              if (trimmed.length > 0) {
                msgList.push({ role: "assistant", content: content });
              }
              msgList.push({
                role: "user",
                content: `Tool Output: AUTO_FALLBACK read_file(${suggestedReadPath})\n${boundedContent}`,
              });
              executedToolCallCount++;
              loops++;
              continue;
            } catch (error) {
              if (subAgentDebugLogging) {
                console.log(`[Sub-Agent] Auto fallback read_file failed: ${error instanceof Error ? error.message : String(error)}`);
              }
              try {
                const autoFiles = await readdir(currentWorkingDirectory);
                const limitedFiles = autoFiles.slice(0, 200);
                if (trimmed.length > 0) {
                  msgList.push({ role: "assistant", content: content });
                }
                msgList.push({
                  role: "user",
                  content: `Tool Output: AUTO_FALLBACK list_directory(.)\n${JSON.stringify(limitedFiles)}`,
                });
                executedToolCallCount++;
                loops++;
                continue;
              } catch {
                // ignore and continue to normal no-tool fallback behavior
              }
            }
          }

          // Check for explicit completion phrase or strict loop limit
          const planningLikeText = /(?:\bI(?:'ll| will)\b|\blet me\b|\bnext\b|\bfirst\b)/i.test(trimmed);
          const shouldTreatAsFinalResponse =
            trimmed.length >= 120 &&
            !planningLikeText;

          // Increment no-tool counter
          noToolCallCount++;

          if (content.includes("TASK_COMPLETED") || content.includes("TASK_FAILED") || shouldTreatAsFinalResponse || noToolCallCount >= 3 || loops >= loopLimit - 1) {
            break; // Done
          }

          if (content.trim().length > 0) {
            msgList.push({ role: "assistant", content: content });
          }

          let reminder = "SYSTEM NOTICE: You did not call a tool. If you are finished, output 'TASK_COMPLETED'. If you cannot complete the task, output 'TASK_FAILED'. If not, USE A TOOL now and return a single JSON tool-call object only (no prose).";
          if (toolsEnabled) {
            if (suggestedReadPath && noToolCallCount <= 3) {
              const escapedPath = suggestedReadPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              reminder += `\nSuggested next step: {"tool":"read_file","args":{"file_name":"${escapedPath}"}}`;
            } else if (noToolCallCount <= 3) {
              reminder += `\nSuggested next step: {"tool":"list_directory","args":{}}`;
            }
          }

          // role must stay "user" — see note on the SYSTEM ERROR push above
          msgList.push({ role: "user", content: reminder });
          loops++;
        }
      } catch (err: any) {
        return { error: err.message, filesModified };
      }

      // Prevent unbounded memory growth
      if (msgList.length > 20) {
        // Keep system message (index 0) and last 18 messages
        const systemMsg = msgList[0];
        const recentMsgs = msgList.slice(-18);
        msgList.length = 0;
        msgList.push(systemMsg, ...recentMsgs);
      }
    }

    if (finalContent) {
      const extracted = extractHandoffMessage(finalContent);
      finalContent = extracted.response;
      handoffMessage = extracted.handoffMessage || "";
    }

    // --- Auto-Save Logic (ported from the reference) ---
    if (autoSave && finalContent) {
      // Regex matches: ```lang (optional space/newline) code ```
      // Relaxed to not strictly require \n, handling ```html code...
      const codeBlockRegex = /```\s*(\w+)?\s*([\s\S]*?)```/g;
      // Get all matches from the ORIGINAL string
      const matches = Array.from(finalContent.matchAll(codeBlockRegex));
      const processedFiles = new Set<string>();

      // Iterate BACKWARDS to preserve indices for replacement
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const fullBlock = match[0];
        const lang = (match[1] || "txt").toLowerCase();
        const code = match[2];
        const index = match.index || 0;

        let handledAsBatch = false;

        // Smart JSON Unpacking
        if (lang === "json") {
          try {
            const parsed = JSON.parse(code);
            if (Array.isArray(parsed)) {
              let extractedCount = 0;
              for (const item of parsed) {
                const fName = item.path || item.file_name || item.name;
                const fContent = item.content || item.data || item.code;

                if (fName && typeof fName === "string" && fContent && typeof fContent === "string") {
                  const fpath = validatePath(currentWorkingDirectory, fName);
                  await mkdir(dirname(fpath), { recursive: true });
                  await writeFile(fpath, fContent, "utf-8");
                  filesModified.push(fName);
                  processedFiles.add(fName);
                  extractedCount++;
                }
              }

              if (extractedCount > 0) {
                handledAsBatch = true;
                const replacement = `\n[System: Successfully extracted and saved ${extractedCount} files from JSON block.]\n`;
                finalContent = finalContent.slice(0, index) + replacement + finalContent.slice(index + fullBlock.length);
              }
            }
          } catch {
            // Not valid JSON or not the structure we want, fall through to normal save
          }
        }

        if (!handledAsBatch && code.trim().length > 50) {
          // Lookback in the ORIGINAL string (match.input is safe)
          const lookback = finalContent.substring(Math.max(0, index - 500), index);

          // Regex to find filenames like `### src/App.tsx`, `**App.tsx**`, `filename: App.tsx`
          const nameMatch = lookback.match(/(?:`|\*\*|###|filename:|file:)[\s\S]*?([\w\-\/\\.]+\.(?:tsx|ts|jsx|js|html|css|json|md|py|sh|java|rs|go|sql|yaml|yml|c|cpp|h|hpp|txt))/i);

          let fileName = "";
          if (nameMatch) {
            fileName = nameMatch[1].trim();
          }

          // Fallback: Check the first line of the code block for a filename comment
          // e.g. // src/App.tsx or # filename: utils.py
          if (!fileName) {
            const firstLine = code.split('\n')[0].trim();
            const commentMatch = firstLine.match(/^(?:\/\/|#|<!--|;)\s*(?:filename:|file:)?\s*([\w\-\/\\.]+\.(?:tsx|ts|jsx|js|html|css|json|md|py|sh|java|rs|go|sql|yaml|yml|c|cpp|h|hpp|txt))/i);
            if (commentMatch) {
              fileName = commentMatch[1].trim();
            }
          }

          // Block Shell/Console snippets from being auto-saved as "auto_gen" files
          // unless there is an EXPLICIT filename match above.
          const isShell = ["bash", "sh", "cmd", "powershell", "console", "zsh", "terminal"].includes(lang);

          if (isShell && !fileName) {
            continue;
          }

          // If we didn't find a filename, skip saving this block.
          // This prevents "auto_gen" files from cluttering the workspace.
          if (!fileName) {
            continue;
          }

          // Deduplication: If we already processed this file in this turn, skip saving it again
          // (the LAST occurrence we are processing is the definitive one).
          if (processedFiles.has(fileName)) {
            continue;
          }

          const fpath = join(currentWorkingDirectory, fileName);

          try {
            await mkdir(dirname(fpath), { recursive: true });
            await writeFile(fpath, code, "utf-8");
            filesModified.push(fileName);
            processedFiles.add(fileName);

            // Replace the block in finalContent using string slicing with the original index
            const replacement = `\n[System: File '${fileName}' created successfully.]\n`;
            finalContent = finalContent.slice(0, index) + replacement + finalContent.slice(index + fullBlock.length);

          } catch (e) {
            console.error(`Failed to auto-save file ${fileName}:`, e);
          }
        }
      }
    }

    // --- Auto-Update Project Info (ported from the reference) ---
    if (filesModified.length > 0) {
      const infoPath = join(currentWorkingDirectory, "beledarian_info.md");
      const timestamp = new Date().toISOString();
      const logEntry = `\n- **[${timestamp}]** Task: "${taskPrompt.substring(0, 50)}..." | Modified: ${filesModified.join(", ")}`;
      try {
        await appendFile(infoPath, logEntry, "utf-8");
      } catch {
        // If append fails, maybe file doesn't exist, try write
        try { await writeFile(infoPath, `# Project History\n${logEntry}`, "utf-8"); } catch { /* ignore */ }
      }
    }

    return { response: finalContent, filesModified, handoff_message: handoffMessage || undefined };
  };

  // --- 1. Primary Agent Loop ---
  const primaryResult = await runAgentLoop(agentRole || "general", task, context || "", 8, false);
  if (primaryResult.error) return JSON.stringify({ error: primaryResult.error, filesModified: primaryResult.filesModified });

  finalResponse = primaryResult.response || "";
  handoffMessage = primaryResult.handoff_message;
  const generatedFiles = [...primaryResult.filesModified];

  // --- 2. Auto-Debug Loop (ported from the reference; the fork runs it for
  // coding tasks = whenever the primary task modified files) ---
  if (primaryResult.filesModified.length > 0) {
    const filesToCheck = primaryResult.filesModified.join(", ");
    const debugTask = `Review the code in these files: ${filesToCheck}. Check for bugs, syntax errors, or logic flaws. If you find any, use 'save_file' to FIX them. If they are correct, confirm it.`;

    // Read content of modified files to pass as context
    let debugContext = "Here is the content of the created files:\n";
    for (const f of primaryResult.filesModified) {
      try {
        const c = await readFile(join(currentWorkingDirectory, f), "utf-8");
        debugContext += `\n--- ${f} ---\n${c}\n`;
      } catch { /* ignore unreadable */ }
    }

    const debugResult = await runAgentLoop("reviewer", debugTask, debugContext, 5, true);

    finalResponse += "\n\n--- Auto-Debug Report ---\n" + (debugResult.response || (debugResult.error ? `Debug pass failed: ${debugResult.error}` : "Debug pass completed."));
    if (debugResult.filesModified.length > 0) {
      finalResponse += `\n(The reviewer fixed these files: ${debugResult.filesModified.join(", ")})`;
    }
    if (!handoffMessage && debugResult.handoff_message) {
      handoffMessage = debugResult.handoff_message;
    }
  }

  // Append generated file list for Main Agent visibility
  if (primaryResult.filesModified.length > 0) {
    const fullPaths = primaryResult.filesModified.map(f => {
      if (isAbsolute(f)) return f;
      return join(currentWorkingDirectory, f);
    });
    finalResponse += `\n\n[GENERATED_FILES]: ${fullPaths.join(", ")}`;

    if (showFullCode) {
      finalResponse += `\n\n### Generated Code Content:\n`;
      for (const f of primaryResult.filesModified) {
        try {
          const fpath = isAbsolute(f) ? f : join(currentWorkingDirectory, f);
          const content = await readFile(fpath, "utf-8");
          const ext = f.split('.').pop() || 'txt';
          finalResponse += `\n**${f}**\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
        } catch { /* ignore unreadable */ }
      }
    }
  }

  // Only hide code blocks when files were actually saved.
  // If nothing was written to disk, leave the raw response intact so the main agent
  // can see what the sub-agent actually did (or didn't do) rather than being misled
  // by a false "code has been handled" success message.
  if (!showFullCode && primaryResult.filesModified.length > 0) {
    finalResponse = finalResponse.replace(/```[\s\S]*?```/g, "\n[System: Code Block Hidden for Brevity. The code has been handled/saved by the sub-agent. Do NOT request it again. Proceed.]\n");
  }

  return JSON.stringify({
    response: finalResponse,
    generated_files: generatedFiles,
    filesModified: primaryResult.filesModified,
    handoff_message: handoffMessage,
  });
}
