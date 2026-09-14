// query_database/handler.ts — read-only SQLite queries (MCP filesystem fork).
//
// Port of the Beledarian query_database tool (beledarians-lm-studio-tools
// src/toolsProvider.ts), with one substitution: the reference uses the native
// better-sqlite3 module; this fork runs on system Node which ships the built-in
// node:sqlite module (DatabaseSync), so no native dependency is added. Same
// behavior: naive write-statement block, open READONLY, prepare + all(), close,
// return { results } or { error }.
import { DatabaseSync } from "node:sqlite";
import { validatePath } from "../helpers/path.js";

export async function handleQueryDatabase(
  dbPath: string,
  query: string,
  allowedDirectories: string[]
): Promise<string> {
  const fpath = await validatePath(dbPath, allowedDirectories);

  // Safety: Attempt to block write operations (naive check)
  if (/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i.test(query)) {
    return JSON.stringify({ error: "Only SELECT/read queries are allowed for safety." });
  }

  try {
    const db = new DatabaseSync(fpath, { readOnly: true });
    const stmt = db.prepare(query);
    const results = stmt.all();
    db.close();
    return JSON.stringify({ results });
  } catch (e) {
    return JSON.stringify({ error: `Database query failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}
