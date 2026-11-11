import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), "..", ".env") });

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3002,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  DEEPEVAL_URL: process.env.DEEPEVAL_URL || `http://localhost:${process.env.DEEPEVAL_PORT || "8002"}/eval`,
};

// Validate required environment variables
if (!ENV.GROQ_API_KEY && !ENV.OPENAI_API_KEY) {
  console.warn(
    "Warning: Neither GROQ_API_KEY nor OPENAI_API_KEY is set. LLM calls will fail."
  );
} else {
  if (!ENV.GROQ_API_KEY) {
    console.info("ℹ️ GROQ_API_KEY not configured. Groq provider is unavailable.");
  } else {
    console.info("✓ Groq provider available.");
  }
  if (!ENV.OPENAI_API_KEY) {
    console.info("ℹ️ OPENAI_API_KEY not configured. OpenAI provider is unavailable.");
  } else {
    console.info("✓ OpenAI provider available.");
  }
}
