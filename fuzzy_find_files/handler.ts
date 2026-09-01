import fs from "fs/promises";
import path from "path";
import { validatePath } from "../helpers/path.js";

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

interface Candidate {
  path: string;
  distance: number;
}

export async function handleFuzzyFindFiles(
  query: string,
  searchPath: string,
  recursive: boolean,
  maxResults: number,
  scanLimit: number,
  allowedDirectories: string[]
): Promise<string> {
  const validRoot = await validatePath(searchPath, allowedDirectories);
  const q = query.toLowerCase();
  const candidates: Candidate[] = [];
  let scanned = 0;
  let truncated = false;

  async function walk(dir: string) {
    if (truncated) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) break;
      scanned++;
      if (scanned > scanLimit) {
        truncated = true;
        break;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const rel = path.relative(validRoot, fullPath).toLowerCase();
        const name = entry.name.toLowerCase();
        const distance = Math.min(levenshtein(q, name), levenshtein(q, rel));
        candidates.push({ path: fullPath, distance });
      }
    }
  }

  await walk(validRoot);

  candidates.sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));
  const top = candidates.slice(0, maxResults);

  if (top.length === 0) {
    return `No files found for query: ${query} (scanned ${scanned} entries)`;
  }

  let output = `Top ${top.length} fuzzy matches for "${query}" (scanned ${scanned} entries${truncated ? ", stopped at scan limit" : ""}):\n`;
  top.forEach((c, i) => {
    output += `${i + 1}. (distance ${c.distance}) ${c.path}\n`;
  });
  return output;
}
