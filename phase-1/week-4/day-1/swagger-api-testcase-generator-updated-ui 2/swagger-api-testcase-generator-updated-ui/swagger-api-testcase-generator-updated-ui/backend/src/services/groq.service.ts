import { env, groqEnabled } from "../config/environment.js";
import { AppError } from "../utils/errors.js";

export function isGroqEnabled(): boolean {
  return groqEnabled;
}

const TPM_SAFETY_MARGIN = 400;
const MIN_COMPLETION_TOKENS = 256;

function estimateTokens(text: string): number {
  // JSON and instruction text contain more punctuation than normal prose, so
  // use a conservative estimate without adding a tokenizer dependency.
  return Math.ceil(text.length / 3);
}

export function getSafeCompletionTokens(systemPrompt: string, userPrompt: string): number {
  const inputTokens = estimateTokens(`${systemPrompt}\n${userPrompt}`);
  const available = env.GROQ_TPM_LIMIT - TPM_SAFETY_MARGIN - inputTokens;
  if (available < MIN_COMPLETION_TOKENS) {
    throw new AppError(
      413,
      "GROQ_INPUT_TOO_LARGE",
      "The specification is too large for the configured Groq token limit. Reduce the specification size and try again."
    );
  }
  return Math.min(env.GROQ_MAX_COMPLETION_TOKENS, available);
}

export async function callGroqJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
  if (!groqEnabled || !env.GROQ_API_KEY || !env.GROQ_MODEL) {
    throw new AppError(503, "GROQ_NOT_CONFIGURED", "Groq is not configured on the backend.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GROQ_TIMEOUT_MS);

  try {
    const maxCompletionTokens = getSafeCompletionTokens(systemPrompt, userPrompt);
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.1,
        max_completion_tokens: maxCompletionTokens,
        // Only sent for models that support it; keeps reasoning models from
        // spending their whole output budget on reasoning and truncating the JSON.
        ...(env.GROQ_REASONING_EFFORT ? { reasoning_effort: env.GROQ_REASONING_EFFORT } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body.slice(0, 500);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        // body was not JSON; keep the raw snippet
      }
      throw new AppError(
        response.status,
        "GROQ_REQUEST_FAILED",
        `Groq request failed (HTTP ${response.status}): ${detail}`,
        { status: response.status, body: body.slice(0, 1000) }
      );
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new AppError(502, "GROQ_EMPTY_RESPONSE", "Groq returned an empty response.");

    try {
      return JSON.parse(content);
    } catch {
      throw new AppError(502, "GROQ_INVALID_JSON", "Groq did not return valid JSON.", { content: content.slice(0, 1000) });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "GROQ_TIMEOUT", "Groq request timed out.");
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError(502, "GROQ_REQUEST_FAILED", `Groq request failed: ${reason}`, { reason });
  } finally {
    clearTimeout(timeout);
  }
}
