// gh/schema.ts — argument schemas for the 8 gh_* tools.
// (MCP filesystem fork; thin gh CLI wrappers that operate against the repo at the
// server process's current working directory — no working-directory parameter, same
// "current working directory context" as the git/shell tools.)
import { z } from "zod";

export const GhAuthArgsSchema = z.object({});

export const GhCreateIssueArgsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export const GhListIssuesArgsSchema = z.object({
  state: z.enum(["open", "closed"]).optional().default("open"),
  labels: z.array(z.string()).optional(),
  limit: z.number().min(1).max(50).optional().default(10),
});

export const GhViewCommentsArgsSchema = z.object({
  number: z.number().describe("The issue or PR number"),
  type: z.enum(["issue", "pr"]).default("issue").describe("Whether it's an issue or a pull request"),
});

export const GhCreatePrArgsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  head_branch: z.string().describe("The branch containing your changes"),
  base_branch: z.string().default("main").describe("The branch you want to merge into (e.g., main, master)"),
});

export const GhListPrsArgsSchema = z.object({
  state: z.enum(["open", "closed"]).optional().default("open"),
  limit: z.number().min(1).max(50).optional().default(10),
});

export const GhViewPrDiffArgsSchema = z.object({
  number: z.number().describe("The PR number"),
});

export const GhPushArgsSchema = z.object({
  branch: z.string().optional().describe("Optional: The branch to push. Defaults to current branch."),
});
