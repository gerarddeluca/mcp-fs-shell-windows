// subagent/schema.ts — zod schema for consult_secondary_agent (MCP filesystem fork).
// Parameter set mirrors the Beledarian reference (toolsProvider.ts L2468-2473).

import { z } from "zod";

export const ConsultSecondaryAgentArgsSchema = z.object({
  task: z.string().describe("The task to delegate to the secondary agent."),
  agent_role: z
    .string()
    .optional()
    .describe("Key from 'Sub-Agent Profiles' config (e.g., 'coder'). Default: 'general'."),
  context: z
    .string()
    .optional()
    .describe("Additional context or data for the agent."),
  allow_tools: z
    .boolean()
    .optional()
    .describe(
      "If true, the secondary agent can use tools like Web Search (DuckDuckGo, Wikipedia), File System (Read/List), and Code Execution (if enabled in settings). Default: false."
    ),
});

export type ConsultSecondaryAgentArgs = z.infer<typeof ConsultSecondaryAgentArgsSchema>;
