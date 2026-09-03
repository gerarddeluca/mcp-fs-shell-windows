import { z } from "zod";

export const LaunchFileArgsSchema = z.object({
  path: z.string(),
});
