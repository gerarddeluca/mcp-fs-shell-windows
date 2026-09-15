// rag/handler.ts — RAG tools (MCP filesystem fork).
//
// Port of the Beledarian rag_local_files (beledarians-lm-studio-tools
// src/toolsProvider.ts L2389-2463) and rag_web_content (L1706-1754) tools.
// Same behavior throughout: rag_local_files recursively scans up to 50 text
// files, chunks on blank lines (>20 chars), keeps chunks scoring above
// cosine similarity 0.4, and returns the top 10 with {file, score, content}
// (score as a 3-decimal string, exactly like the reference). rag_web_content
// fetches the URL, converts to plain text with html-to-text (the same
// options the fork's fetch_web_content tool uses), and returns the top 5
// chunks from performRagOnText. Embedding goes through the LM Studio
// /v1/embeddings endpoint (see helpers.ts) instead of the SDK client.
import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";
import { chunkText, cosineSimilarity, embedStrings, performRagOnText } from "./helpers.js";

export async function handleRagLocalFiles(
  query: string,
  searchPath: string | undefined,
  filePattern: string | undefined,
  allowedDirectories: string[]
): Promise<string> {
  try {
    const targetDir = await validatePath(searchPath ?? ".", allowedDirectories);
    const entries = await fs.readdir(targetDir, { recursive: true, withFileTypes: true });
    const textFiles = entries.filter(
      (e) => e.isFile() && !e.name.match(/\.(png|jpg|jpeg|gif|ico|exe|dll|bin)$/i)
    );

    // Filter by pattern if provided
    const filteredFiles = filePattern
      ? textFiles.filter(
          (e) => e.name.includes(filePattern) || path.join(e.parentPath, e.name).includes(filePattern)
        )
      : textFiles;

    // Limit to avoid massive reads. In a real 'Gemini Flow' robust
    // implementation, we'd use an index. Here we'll read top 50 files max to be safe.
    const filesToScan = filteredFiles.slice(0, 50);

    let allChunks: { chunk: string; score: number; file: string }[] = [];
    const [queryEmbedding] = await embedStrings([query]);

    for (const file of filesToScan) {
      try {
        const fullPath = path.join(file.parentPath, file.name);
        const content = await fs.readFile(fullPath, "utf-8");
        // reuse chunking logic
        const chunks = chunkText(content);
        if (chunks.length === 0) continue;

        // Batch embed chunks for this file
        const chunkEmbeddings = await embedStrings(chunks);

        chunks.forEach((chunk, i) => {
          const score = cosineSimilarity(queryEmbedding, chunkEmbeddings[i]);
          if (score > 0.4) { // Threshold
            allChunks.push({ chunk, score, file: file.name });
          }
        });
      } catch {
        // ignore read errors
      }
    }

    // Sort all chunks
    allChunks.sort((a, b) => b.score - a.score);

    return JSON.stringify({
      query,
      results: allChunks.slice(0, 10).map((c) => ({
        file: c.file,
        score: c.score.toFixed(3),
        content: c.chunk,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      error: `Local RAG failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function handleRagWebContent(url: string, query: string): Promise<string> {
  try {
    // 1. Fetch content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    let text = await response.text();

    // Same text extraction the fork's fetch_web_content tool uses
    const { compile } = await import("html-to-text");
    const compiledConvert = compile({
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    });

    text = compiledConvert(text);

    if (text.length === 0) {
      return JSON.stringify({ error: "Could not extract any text from the URL." });
    }

    // 2. Perform RAG
    const ragResults = await performRagOnText(text, query);

    return JSON.stringify({
      url: url,
      query: query,
      relevant_chunks: ragResults,
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed during RAG web search: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
