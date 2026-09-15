// rag/helpers.ts — shared RAG helpers (MCP filesystem fork).
//
// Port of the Beledarian RAG core (beledarians-lm-studio-tools
// src/toolsProvider.ts: cosineSimilarity L76-84, performRagOnText L86-110),
// with one substitution: the reference embeds through the LM Studio SDK
// client; this fork runs on plain Node, so embedding is a fetch against
// LM Studio's OpenAI-compatible API: POST http://127.0.0.1:1234/v1/embeddings
// with JSON { model, input: [strings] } and (when a token is available)
// Authorization: Bearer <token>. The token is read from the overnight
// pipeline's token file; if that file is missing or empty the request is
// sent keyless. All thresholds, chunking, and top-N behavior are identical
// to the reference.
import fs from "fs";

const EMBEDDINGS_URL = "http://127.0.0.1:1234/v1/embeddings";
const TOKEN_FILE =
  "C:/Users/Gerar/.beledarians-llm-toolbox/workspace/overnight/lm_api_token.txt";
const DEFAULT_EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5";

// Read the API token fresh on every call (small file; rotation stays live).
function readApiKey(): string | null {
  try {
    const token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

// Env override for the embedding model id (LM Studio resolves model ids the
// same way for the /v1/embeddings endpoint).
function getEmbedModel(): string {
  const override = process.env.MCP_RAG_EMBED_MODEL;
  return override && override.trim().length > 0 ? override.trim() : DEFAULT_EMBED_MODEL;
}

// Embed a batch of strings. Response shape: {data: [{embedding: number[], index}]}.
// Results are mapped back to input order by `index`. One retry (2 attempts)
// on transient network/API errors with a short backoff — the first embedding
// call of a session can trigger an auto-load of the embedding model on its
// own llama-server, which takes a few seconds.
export async function embedStrings(strings: string[]): Promise<number[][]> {
  if (strings.length === 0) return [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = readApiKey();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(EMBEDDINGS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: getEmbedModel(), input: strings }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`embeddings HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const data: any = await res.json();
      if (!data || !Array.isArray(data.data)) {
        throw new Error("embeddings response missing data array");
      }
      const byIndex = new Map<number, number[]>();
      for (const item of data.data) {
        byIndex.set(item.index, item.embedding);
      }
      return strings.map((_, i) => {
        const e = byIndex.get(i);
        if (!Array.isArray(e) || e.length === 0) {
          throw new Error(`embeddings response missing embedding for index ${i}`);
        }
        return e;
      });
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Helper function for cosine similarity (identical to the reference).
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dotProduct / (magA * magB);
}

// Paragraph-based chunking (identical to the reference): split on blank
// lines, keep chunks with more than 20 non-whitespace characters.
export function chunkText(text: string): string[] {
  return text.split(/\n\s*\n/).filter((chunk) => chunk.trim().length > 20);
}

// Main RAG-on-text helper (identical behavior to the reference:
// chunk, embed query + chunks, cosine similarity, sort, top 5).
export async function performRagOnText(
  text: string,
  query: string
): Promise<Array<{ chunk: string; score: number }>> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return [{ chunk: text.substring(0, 4000), score: 1 }];
  }

  const [queryEmbedding] = await embedStrings([query]);
  const chunkEmbeddings = await embedStrings(chunks);

  const similarities = chunkEmbeddings.map((chunkEmb, i) => ({
    chunk: chunks[i],
    score: cosineSimilarity(queryEmbedding, chunkEmb),
  }));

  similarities.sort((a, b) => b.score - a.score);
  return similarities.slice(0, 5); // Return top 5
}
