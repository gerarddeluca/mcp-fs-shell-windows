// git/schema.ts — argument schemas for the 6 git_* tools.
// (MCP filesystem fork; thin git CLI wrappers that operate against the repo at the
// server process's current working directory — no working-directory parameter, same
// "current working directory context" as the shell tools.)
import { z } from "zod";

export const GitStatusArgsSchema = z.object({});

export const GitDiffArgsSchema = z.object({
  file_path: z.string().optional().describe("Optional: Path to specific file to diff."),
  cached: z.boolean().optional().describe("Optional: Show staged changes only (git diff --cached)."),
});

export const GitCommitArgsSchema = z.object({
  message: z.string(),
});

export const GitLogArgsSchema = z.object({
  max_count: z.number().optional().describe("Max number of commits to return (default: 10)"),
});

export const GitAddArgsSchema = z.object({
  paths: z.array(z.string()).optional().describe("Optional: Specific file paths to stage. If omitted, stages all changes."),
});

export const GitCheckoutArgsSchema = z.object({
  branch_name: z.string().describe("Name of the branch to checkout."),
  create_new: z.boolean().optional().default(false).describe("If true, creates the branch if it doesn't exist (like git checkout -b)."),
});
