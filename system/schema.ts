// system/schema.ts — argument schemas for the 6 system tools.
// (MCP filesystem fork; Beledarian-parity system utilities: OS/CPU/memory
// info, clipboard read/write, desktop notifications, open file/URL, HTML
// preview. Ported from the reference Beledarian toolsProvider.ts.)
import { z } from "zod";

export const GetSystemInfoArgsSchema = z.object({});

export const ReadClipboardArgsSchema = z.object({});

export const WriteClipboardArgsSchema = z.object({
  content: z.string(),
});

export const SendNotificationArgsSchema = z.object({
  title: z.string(),
  message: z.string(),
});

export const OpenFileArgsSchema = z.object({
  target: z.string().describe("File path or URL"),
});

export const PreviewHtmlArgsSchema = z.object({
  html_content: z.string(),
  file_name: z.string().optional().describe("Optional filename (default: preview.html)"),
});
