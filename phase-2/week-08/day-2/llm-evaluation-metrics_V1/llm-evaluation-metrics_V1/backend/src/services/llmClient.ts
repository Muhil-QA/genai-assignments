import axios from "axios";
import { ENV } from "../config/env.js";

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string, model: string, temperature: number = 0.7): Promise<string> {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature
    },
    {
      headers: {
        Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content as string;
}

/**
 * Call Groq API
 */
async function callGroq(prompt: string, model: string, temperature: number = 0.7): Promise<string> {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature
    },
    {
      headers: {
        Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content as string;
}

/**
 * Determine which provider to use based on model name
 */
export function getProvider(model: string): "openai" | "groq" {
  const lower = model.toLowerCase();
  // Groq models hosted on Groq API
  const groqPrefixes = ["llama-", "meta-llama/", "mixtral-", "gemma", "qwen", "openai/", "allam-", "canopylabs/"];
  if (groqPrefixes.some(prefix => lower.startsWith(prefix))) {
    return "groq";
  }
  // Standard OpenAI models (gpt-4, gpt-4o, gpt-3.5-turbo, etc.)
  return "openai";
}

/**
 * Call LLM with provider selection
 */
export async function callLLM(
  prompt: string,
  model?: string,
  temperature?: number
): Promise<string> {
  const selectedModel = model || "llama-3.3-70b-versatile"; // Default to Groq model
  const selectedTemperature = temperature !== undefined ? temperature : 0.7; // Default temperature

  if (!prompt || prompt.trim() === "") {
    throw new Error("Prompt cannot be empty");
  }

  if (!selectedModel || selectedModel.trim() === "") {
    throw new Error(`Invalid model: "${selectedModel}". Model cannot be empty.`);
  }

  const provider = getProvider(selectedModel);
  console.log(`Using provider: ${provider}, model: ${selectedModel}, temperature: ${selectedTemperature}`);

  try {
    if (provider === "groq") {
      return await callGroq(prompt, selectedModel, selectedTemperature);
    } else {
      return await callOpenAI(prompt, selectedModel, selectedTemperature);
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new Error(
        `LLM API Error: ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`
      );
    }
    throw err;
  }
}
