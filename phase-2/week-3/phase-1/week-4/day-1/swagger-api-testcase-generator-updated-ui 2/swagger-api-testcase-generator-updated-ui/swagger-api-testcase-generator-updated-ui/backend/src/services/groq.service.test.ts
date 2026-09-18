import { describe, expect, it } from "vitest";
import { env } from "../config/environment.js";
import { getSafeCompletionTokens } from "./groq.service.js";

describe("getSafeCompletionTokens", () => {
  it("keeps small requests at the configured completion cap", () => {
    expect(getSafeCompletionTokens("short system prompt", "short user prompt")).toBe(env.GROQ_MAX_COMPLETION_TOKENS);
  });

  it("reduces completion tokens when the prompt consumes the TPM budget", () => {
    const tokens = getSafeCompletionTokens("x".repeat(9000), "y".repeat(3000));
    expect(tokens).toBeLessThan(env.GROQ_MAX_COMPLETION_TOKENS);
    expect(tokens).toBeGreaterThanOrEqual(256);
  });
});
