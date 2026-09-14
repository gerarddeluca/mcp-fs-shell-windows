// read_document/handler.ts — read content from PDF or DOCX files (MCP filesystem fork).
//
// Port of the Beledarian read_document tool (beledarians-lm-studio-tools
// src/toolsProvider.ts). PDF via pdf-parse v2 class-based API
// (new PDFParse({ data }) -> getText() / getInfo() / destroy()); DOCX via
// mammoth extractRawText. The DOMMatrix polyfill is required by pdf-parse v2
// (pdfjs) in a bare Node environment and is ported VERBATIM from the reference.
import { readFile } from "fs/promises";
import { validatePath } from "../helpers/path.js";

// Polyfill DOMMatrix for pdf-parse v2 (required for node environment)
function ensureDomMatrix(): void {
  if (typeof (global as any).DOMMatrix === "undefined") {
    (global as any).DOMMatrix = class DOMMatrix {
      constructor(arg?: any) {
        (this as any).a = 1; (this as any).b = 0; (this as any).c = 0; (this as any).d = 1; (this as any).e = 0; (this as any).f = 0;
        if (Array.isArray(arg)) {
          (this as any).a = arg[0]; (this as any).b = arg[1];
          (this as any).c = arg[2]; (this as any).d = arg[3];
          (this as any).e = arg[4]; (this as any).f = arg[5];
        }
      }
    };
  }
}

export async function handleReadDocument(
  filePath: string,
  allowedDirectories: string[]
): Promise<string> {
  const fpath = await validatePath(filePath, allowedDirectories);
  const ext = fpath.split('.').pop()?.toLowerCase();

  try {
    if (ext === 'pdf') {
      ensureDomMatrix();
      // Dynamically import pdf-parse v2 (ESM equivalent of the reference's require)
      const { PDFParse } = await import("pdf-parse");

      const dataBuffer = await readFile(fpath);
      // Use new class-based API
      const parser = new PDFParse({ data: dataBuffer });
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo(); // Optional: get metadata

      await parser.destroy(); // Cleanup

      return JSON.stringify({ content: textResult.text, metadata: infoResult.info });
    } else if (ext === 'docx') {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: fpath });
      return JSON.stringify({ content: result.value, messages: result.messages });
    } else {
      return JSON.stringify({ error: "Unsupported document format. Use read_file for text files." });
    }
  } catch (e) {
    return JSON.stringify({ error: `Failed to read document: ${e instanceof Error ? e.message : String(e)}` });
  }
}
