import assert from "node:assert/strict";
import test from "node:test";
import {
  GroqApiError,
  GroqLLMService,
  LLMOutputError,
} from "../src/modules/retrieval/services/LLMService";
import { SearchCandidate } from "../src/modules/retrieval/types/retrieval.types";

const candidates: SearchCandidate[] = [
  {
    resumeId: "resume-1",
    name: "Candidate One",
    role: "QA Architect",
    skills: ["RAG"],
    snippet: "Built RAG evaluation systems.",
    sources: ["bm25", "vector"],
  },
  {
    resumeId: "resume-2",
    name: "Candidate Two",
    snippet: "Quality engineering experience.",
    sources: ["bm25"],
  },
];

function createService(
  content: string,
  onRequest?: (body: Record<string, unknown>) => void,
): GroqLLMService {
  return new GroqLLMService(
    { apiKey: "test-key", model: "test-model" },
    async (_input, init) => {
      if (onRequest)
        onRequest(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ message: { content } }] });
    },
  );
}

test("reranks only the requested number of deduplicated input candidates", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = createService("resume-2\nresume-1", (body) => {
    requestBody = body;
  });
  const duplicateCandidates = [
    { ...candidates[0]!, snippet: "x".repeat(2000) },
    candidates[1]!,
    candidates[0]!,
  ];

  const results = await service.rerankCandidates(
    "RAG evaluation",
    duplicateCandidates,
    2,
  );

  assert.deepEqual(results, [
    { resumeId: "resume-2", rank: 1 },
    { resumeId: "resume-1", rank: 2 },
  ]);
  const messages = requestBody?.messages as Array<{ content: string }>;
  const sent = JSON.parse(messages[1]!.content) as {
    candidates: Array<{ resumeId: string }>;
  };
  assert.deepEqual(
    sent.candidates.map(({ resumeId }) => resumeId),
    ["resume-1", "resume-2"],
  );
  assert.equal(requestBody?.response_format, undefined);
  assert.equal(requestBody?.max_completion_tokens, 1000);
  assert.equal(requestBody?.max_tokens, undefined);
  const sentCandidates = JSON.parse(messages[1]!.content) as {
    candidates: Array<{ snippet?: string }>;
  };
  assert.equal(sentCandidates.candidates[0]?.snippet?.length, 500);
});

test("reranking rejects hallucinated or duplicate candidate IDs", async () => {
  const hallucinated = createService("not-provided");
  await assert.rejects(
    hallucinated.rerankCandidates("query", candidates),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "RERANK_INVALID_RESPONSE",
  );

  const duplicate = createService("resume-1\nresume-1\nresume-2");
  await assert.rejects(
    duplicate.rerankCandidates("query", candidates),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "RERANK_INVALID_CANDIDATE",
  );
});

test("reranking rejects output without candidate IDs and invalid topK", async () => {
  await assert.rejects(
    createService("not a candidate ID").rerankCandidates("query", candidates),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "RERANK_INVALID_RESPONSE",
  );
  await assert.rejects(
    createService("{}").rerankCandidates("query", candidates, 0),
    /positive topK/,
  );
  await assert.rejects(
    createService("resume-1").rerankCandidates("query", candidates, 2, 3),
    /positive topK/,
  );
});

test("reranking accepts a complete requested top list without requiring lower-ranked IDs", async () => {
  const results = await createService("resume-1\nresume-2").rerankCandidates(
    "query",
    candidates,
    10,
    2,
  );

  assert.deepEqual(results, [
    { resumeId: "resume-1", rank: 1 },
    { resumeId: "resume-2", rank: 2 },
  ]);
});

test("reranking rejects output shorter than the requested result count", async () => {
  await assert.rejects(
    createService("resume-1").rerankCandidates("query", candidates, 10, 2),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "RERANK_INVALID_RESPONSE",
  );
});

test("reranking accepts exact candidate IDs in model-ranked order", async () => {
  const results = await createService(
    "1. resume-1\n2. resume-2",
  ).rerankCandidates("RAG evaluation", candidates, 2, 2);

  assert.deepEqual(results, [
    { resumeId: "resume-1", rank: 1 },
    { resumeId: "resume-2", rank: 2 },
  ]);
});

test("summary uses selected style/token cap and returns grounded summary text", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = createService(
    "Direct RAG evaluation experience is relevant.",
    (body) => {
      requestBody = body;
    },
  );

  assert.equal(
    await service.summarizeCandidateFit("RAG evaluator", candidates[0]!, {
      style: "short",
      maxTokens: 120,
    }),
    "Direct RAG evaluation experience is relevant.",
  );
  assert.equal(requestBody?.max_completion_tokens, 120);
  assert.equal(requestBody?.response_format, undefined);
  const messages = requestBody?.messages as Array<{ content: string }>;
  assert.match(messages[0]!.content, /short style/);
  assert.match(messages[0]!.content, /no JSON wrapper/);
});

test("summary limits resume text sent to the LLM", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = createService("Short summary.", (body) => {
    requestBody = body;
  });

  await service.summarizeCandidateFit(
    "QA engineer",
    { ...candidates[0]!, snippet: "x".repeat(2000) },
    { style: "short", maxTokens: 100 },
  );

  const messages = requestBody?.messages as Array<{ content: string }>;
  const sent = JSON.parse(messages[1]!.content) as {
    candidate: { snippet?: string };
  };
  assert.equal(sent.candidate.snippet?.length, 500);
});

test("batch summaries use one bounded provider call and validate candidate IDs", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = createService(
    "resume-2\tGood quality engineering fit.\nresume-1\tStrong RAG evaluation fit.",
    (body) => {
      requestBody = body;
    },
  );

  const summaries = await service.summarizeCandidateFits("RAG QA", candidates, {
    style: "short",
    maxTokens: 150,
  });

  assert.deepEqual(summaries, [
    { resumeId: "resume-2", summary: "Good quality engineering fit." },
    { resumeId: "resume-1", summary: "Strong RAG evaluation fit." },
  ]);
  assert.equal(requestBody?.max_completion_tokens, 300);
  assert.equal(requestBody?.response_format, undefined);

  const invalid = createService(
    "resume-1\tValid.\nunknown\tUnknown candidate.",
  );
  await assert.rejects(
    invalid.summarizeCandidateFits("RAG QA", candidates, {
      style: "short",
      maxTokens: 150,
    }),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "SUMMARY_BATCH_INVALID_ITEM",
  );
});

test("summary validates style and token limits", async () => {
  const service = createService("Summary.");
  await assert.rejects(
    service.summarizeCandidateFit("query", candidates[0]!, {
      style: "short",
      maxTokens: 0,
    }),
    /Invalid candidate summary options/,
  );
  await assert.rejects(
    service.summarizeCandidateFit("query", candidates[0]!, {
      style: "detailed",
      maxTokens: 1001,
    }),
    /Invalid candidate summary options/,
  );
});

test("metadata extraction validates the parsed resume schema", async () => {
  const service = createService(
    JSON.stringify({
      name: "Candidate",
      role: "QA Architect",
      totalExperience: 12,
      skills: ["RAG"],
    }),
  );

  assert.deepEqual(
    await service.extractMetadata(
      "Candidate has 12 years of experience with RAG.",
    ),
    {
      name: "Candidate",
      role: "QA Architect",
      totalExperience: 12,
      skills: ["RAG"],
    },
  );
  await assert.rejects(
    service.extractMetadata("  "),
    /Resume text is required/,
  );
});

test("Groq errors and missing API keys are surfaced without calling the provider", async () => {
  let called = false;
  const unconfigured = new GroqLLMService(
    { apiKey: "YOUR_KEY", model: "test-model" },
    async () => {
      called = true;
      return Response.json({});
    },
  );
  await assert.rejects(
    unconfigured.rerankCandidates("query", candidates),
    /GROQ_API_KEY is not configured/,
  );
  assert.equal(called, false);

  const unavailable = new GroqLLMService(
    { apiKey: "test-key", model: "test-model" },
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(
    unavailable.extractMetadata("Candidate resume text"),
    /HTTP 503/,
  );
});

test("Groq HTTP errors preserve only safe status, provider code, and type diagnostics", async () => {
  const service = new GroqLLMService(
    { apiKey: "test-key", model: "unavailable-model" },
    async () =>
      Response.json(
        {
          error: {
            message: "Sensitive provider detail",
            type: "invalid_request_error",
            code: "model_not_found",
          },
        },
        {
          status: 404,
          headers: {
            "retry-after": "2",
            "x-ratelimit-limit-tokens": "18000",
            "x-ratelimit-remaining-tokens": "0",
            "x-ratelimit-reset-tokens": "7.66s",
          },
        },
      ),
  );

  await assert.rejects(
    service.extractMetadata("Candidate resume text"),
    (error: unknown) => {
      assert.ok(error instanceof GroqApiError);
      assert.equal(error.providerStatus, 404);
      assert.equal(error.providerCode, "model_not_found");
      assert.equal(error.providerType, "invalid_request_error");
      assert.equal(error.retryAfter, "2");
      assert.equal(error.tokenLimit, "18000");
      assert.equal(error.remainingTokens, "0");
      assert.equal(error.tokenReset, "7.66s");
      assert.equal(error.message, "Groq API returned HTTP 404");
      return true;
    },
  );
});

test("reranking bypasses provider JSON modes and requests tab-separated rows", async () => {
  let calls = 0;
  let requestBody: Record<string, unknown> | undefined;
  const service = new GroqLLMService(
    { apiKey: "test-key", model: "test-model" },
    async (_input, init) => {
      calls += 1;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [
          {
            message: {
              content: "resume-1\nresume-2",
            },
          },
        ],
      });
    },
  );

  const results = await service.rerankCandidates(
    "RAG evaluator",
    candidates,
    2,
  );

  assert.equal(results.length, 2);
  assert.equal(calls, 1);
  assert.equal(requestBody?.max_completion_tokens, 1000);
  assert.equal(requestBody?.response_format, undefined);
  const messages = requestBody?.messages as Array<{ content: string }>;
  assert.match(messages[0]!.content, /exactly 2 candidate resumeId values/);
});

test("retries an empty text completion once with an explicit non-empty instruction", async () => {
  let calls = 0;
  let retryBody: Record<string, unknown> | undefined;
  const service = new GroqLLMService(
    { apiKey: "test-key", model: "test-model" },
    async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (calls === 1) {
        assert.equal(body.response_format, undefined);
        return Response.json({
          choices: [{ message: { content: "  \n" } }],
        });
      }
      retryBody = body;
      return Response.json({
        choices: [
          {
            message: {
              content: "resume-1\nresume-2",
            },
          },
        ],
      });
    },
  );

  const results = await service.rerankCandidates("RAG evaluator", candidates);

  assert.equal(calls, 2);
  assert.equal(results.length, 2);
  assert.equal(retryBody?.max_completion_tokens, 1200);
  const messages = retryBody?.messages as Array<{ content: string }>;
  assert.match(messages[0]!.content, /non-empty response/);
});

test("uses low-reasoning completion settings for GPT-OSS and records safe finish reason", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = new GroqLLMService(
    { apiKey: "test-key", model: "openai/gpt-oss-120b" },
    async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [
          {
            finish_reason: "length",
            message: { content: null },
          },
        ],
      });
    },
  );

  await assert.rejects(
    service.rerankCandidates("RAG evaluator", candidates),
    (error: unknown) =>
      error instanceof LLMOutputError &&
      error.errorCode === "GROQ_NO_CONTENT" &&
      error.finishReason === "length",
  );
  assert.equal(requestBody?.max_completion_tokens, 1000);
  assert.equal(requestBody?.reasoning_effort, "low");
  assert.equal(requestBody?.include_reasoning, false);
});

test("does not retry repeated Groq JSON validation failures indefinitely", async () => {
  let calls = 0;
  const service = new GroqLLMService(
    { apiKey: "test-key", model: "test-model" },
    async () => {
      calls += 1;
      return Response.json(
        {
          error: {
            code: "json_validate_failed",
            type: "invalid_request_error",
          },
        },
        { status: 400 },
      );
    },
  );

  await assert.rejects(
    service.extractMetadata("Candidate resume text"),
    (error: unknown) =>
      error instanceof GroqApiError &&
      error.providerCode === "json_validate_failed",
  );
  assert.equal(calls, 2);
});
