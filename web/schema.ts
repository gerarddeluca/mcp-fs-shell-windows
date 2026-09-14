import { z } from "zod";

export const WebSearchArgsSchema = z.object({
  query: z.string().describe("The search query"),
  providers: z
    .array(z.enum(["duckduckgo-api", "duckduckgo-fetch", "duckduckgo-html", "google", "bing"]))
    .optional()
    .describe("Optional: List of specific providers. If omitted, fallback chain is: DDG Fetch (no Chrome) -> DDG API -> DDG browser -> Google -> Bing."),
});

export const FetchWebContentArgsSchema = z.object({
  url: z.string().describe("The URL to fetch"),
});

export const WikipediaSearchArgsSchema = z.object({
  query: z.string().describe("The search query"),
  lang: z
    .string()
    .optional()
    .describe("Language code (default: en)"),
});
