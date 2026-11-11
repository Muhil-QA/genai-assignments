import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const maxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 5);
const maxJsonBodySizeMb = Number(process.env.MAX_JSON_BODY_SIZE_MB ?? 1);
const embeddingDimension = Number(process.env.EMBEDDING_DIMENSION ?? 1024);
const mongodbBm25SearchIndex = process.env.MONGODB_BM25_SEARCH_INDEX ?? "BM25_index";
const mongodbVectorSearchIndex = process.env.MONGODB_VECTOR_SEARCH_INDEX ?? "resume_vector_index";

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("PORT must be an integer between 0 and 65535");
}

if (!Number.isFinite(maxUploadSizeMb) || maxUploadSizeMb <= 0) {
  throw new Error("MAX_UPLOAD_SIZE_MB must be a positive number");
}

if (!Number.isFinite(maxJsonBodySizeMb) || maxJsonBodySizeMb <= 0) {
  throw new Error("MAX_JSON_BODY_SIZE_MB must be a positive number");
}

if (!Number.isInteger(embeddingDimension) || embeddingDimension <= 0) {
  throw new Error("EMBEDDING_DIMENSION must be a positive integer");
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV ?? "development",
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "resume_rag",
  maxUploadSizeBytes: Math.floor(maxUploadSizeMb * 1024 * 1024),
  maxJsonBodySizeBytes: Math.floor(maxJsonBodySizeMb * 1024 * 1024),
  useLlmParser: process.env.USE_LLM_PARSER === "true",
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
  mistralApiKey: process.env.MISTRAL_API_KEY,
  mistralEmbedModel: process.env.MISTRAL_EMBED_MODEL ?? "mistral-embed",
  embeddingDimension,
  mongodbBm25SearchIndex,
  mongodbVectorSearchIndex,
};