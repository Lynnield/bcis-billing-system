import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  // Where database dumps are written/read. Kept outside the web root; never
  // served by the API itself.
  BACKUP_DIR: z.string().min(1).default("./backups"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
