import { z } from "zod";

export const ReadDocumentArgsSchema = z.object({
  file_path: z.string(),
});
