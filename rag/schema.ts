import { z } from "zod";

export const RagLocalFilesArgsSchema = z.object({
  query: z.string().describe("The search query to match file contents against"),
  path: z
    .string()
    .optional()
    .describe("Root directory to search (default: the server process's working directory). Must be within an allowed directory."),
  file_pattern: z
    .string()
    .optional()
    .describe("File pattern to include (e.g. '.ts', 'src/'). Default: all text files."),
});

export const RagWebContentArgsSchema = z.object({
  url: z.string().describe("The URL to fetch"),
  query: z.string().describe("The query to find relevant content for"),
});
