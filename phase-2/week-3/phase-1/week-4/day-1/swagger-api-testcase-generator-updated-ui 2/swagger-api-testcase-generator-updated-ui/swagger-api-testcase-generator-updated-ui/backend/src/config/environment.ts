import "dotenv/config";
import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(5),
  MAX_REMOTE_FILE_SIZE_MB: z.coerce.number().positive().default(5),
  SWAGGER_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_MODEL: z.string().trim().optional(),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  GROQ_MAX_COMPLETION_TOKENS: z.coerce.number().int().positive().default(8000),
  GROQ_TPM_LIMIT: z.coerce.number().int().positive().default(8000),
  // Reasoning models (e.g. openai/gpt-oss-*) spend completion budget on reasoning
  // tokens; keeping this low prevents the JSON output from being truncated.
  GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high"]).optional(),
  MAX_TEST_CASES: z.coerce.number().int().positive().default(50)
});

export const env = EnvironmentSchema.parse(process.env);
export const groqEnabled = Boolean(env.GROQ_API_KEY && env.GROQ_MODEL);
