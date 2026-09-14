import { z } from "zod";

export const QueryDatabaseArgsSchema = z.object({
  db_path: z.string(),
  query: z.string(),
});
