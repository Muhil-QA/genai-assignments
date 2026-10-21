import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { LLMOutputError } from "../src/modules/retrieval/services/LLMService";
import {
  MongoSearchService,
  SearchUnavailableError,
} from "../src/modules/retrieval/services/SearchService";
import {
  Bm25ResumeHit,
  SearchCandidate,
  VectorResumeHit,
} from "../src/modules/retrieval/types/retrieval.types";

const bm25Hits: Bm25ResumeHit[] = [
  {
    _id: new ObjectId("000000000000000000000001"),
    name: "BM25 Candidate",
    role: "QA",
    totalExperience: 12,
    skills: ["RAG"],
    snippet: "RAG evaluation",
    bm25Score: 8.4,
  },
  {
    _id: new ObjectId("000000000000000000000002"),
    name: "Shared Candidate",
    role: "Architect",
    totalExperience: 15,
    skills: ["DeepEval"],
    snippet: "DeepEval systems",
    bm25Score: 7.1,
  },
];
const vectorHits: VectorResumeHit[] = [
  {
    _id: new ObjectId("000000000000000000000002"),
    name: "Shared Candidate",
    role: "Architect",
    totalExperience: 15,
    skills: ["DeepEval"],
    snippet: "DeepEval systems",
    vectorScore: 0.91,
  },
  {
    _id: new ObjectId("000000000000000000000003"),
    name: "Vector Candidate",
    role: "Engineer",
    totalExperience: 10,
    skills: ["MCP"],
    snippet: "MCP and agentic QA",
    vectorScore: 0.87,
  },
];

test("end-to-end search merges, deduplicates, reranks, and returns configured summaries", async () => {
  let rerankInput: SearchCandidate[] = [];
  let bm25Limit = 0;
  let vectorLimit = 0;
  let exactRescoreRequested = false;
  let rerankResultCount = 0;
  const service = new MongoSearchService(
    {
      searchBm25: async (_query, _filters, topK) => {
        bm25Limit = topK;
        return bm25Hits.slice(0, topK);
      },
      searchVector: async (_vector, topK, _filters, exactRescore) => {
        vectorLimit = topK;
        exactRescoreRequested = exactRescore ?? false;
        return vectorHits.slice(0, topK);
      },
    },
    {
      generateQueryEmbedding: async () => [0.1, 0.2],
    },
    {
      rerankCandidates: async (_query, candidates, topK, resultCount) => {
        rerankInput = candidates;
        rerankResultCount = resultCount ?? 0;
        return candidates
          .slice(0, topK)
          .reverse()
          .slice(0, resultCount)
          .map((candidate, index) => ({
            resumeId: candidate.resumeId,
            rank: index + 1,
            relevanceScore: 0.9 - index * 0.1,
            reason: "Matched supplied candidate evidence.",
          }));
      },
      summarizeCandidateFit: async (_query, candidate, options) =>
        `${options.style}:${candidate.resumeId}:${options.maxTokens}`,
    },
  );

  const result = await service.endToEndSearch(
    "RAG QA architect",
    {},
    {
      bm25TopK: 10,
      vectorTopK: 8,
      rerankTopN: 3,
      finalTopK: 2,
      summarize: true,
      summaryStyle: "detailed",
      summaryMaxTokens: 120,
      exactVectorRescore: true,
    },
  );

  assert.equal(rerankInput.length, 3);
  assert.equal(rerankResultCount, 2);
  assert.equal(bm25Limit, 10);
  assert.equal(vectorLimit, 8);
  assert.equal(exactRescoreRequested, true);
  assert.deepEqual(
    rerankInput.map((candidate) => candidate.resumeId),
    [
      "000000000000000000000001",
      "000000000000000000000002",
      "000000000000000000000003",
    ],
  );
  assert.deepEqual(rerankInput[1]?.sources, ["bm25", "vector"]);
  assert.equal(result.query, "RAG QA architect");
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.resumeId, "000000000000000000000003");
  assert.equal(
    result.results[0]?.summary,
    "detailed:000000000000000000000003:120",
  );
  assert.equal(result.degraded, false);
  assert.deepEqual(result.warnings, []);
  assert.ok(Object.values(result.timings).every(Number.isFinite));
});

test("end-to-end search skips summaries by default and validates options", async () => {
  let summariesRequested = false;
  const service = new MongoSearchService(
    {
      searchBm25: async () => [],
      searchVector: async () => [],
    },
    {
      generateQueryEmbedding: async () => [0.1],
    },
    {
      rerankCandidates: async () => [],
      summarizeCandidateFit: async () => {
        summariesRequested = true;
        return "summary";
      },
    },
  );

  const result = await service.endToEndSearch("query", {});
  assert.equal(result.results.length, 0);
  assert.equal(result.timings.summarizeMs, 0);
  assert.equal(summariesRequested, false);
  await assert.rejects(
    service.endToEndSearch("query", {}, { finalTopK: 0 }),
    /Invalid end-to-end search options/,
  );
});

test("vector failure falls back to BM25 candidates and marks degraded response", async () => {
  const service = new MongoSearchService(
    {
      searchBm25: async () => [bm25Hits[0]!],
      searchVector: async () => {
        throw new Error("Atlas vector search failed");
      },
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async (_query, candidates) => [
        {
          resumeId: candidates[0]!.resumeId,
          rank: 1,
          relevanceScore: 0.9,
          reason: "Matched BM25 evidence.",
        },
      ],
      summarizeCandidateFit: async () => "unused",
    },
  );

  const result = await service.endToEndSearch("RAG architect", {});

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.resumeId, "000000000000000000000001");
  assert.equal(result.degraded, true);
  assert.equal(result.vectorFallback, true);
  assert.ok(result.warnings.includes("VECTOR_SEARCH_FAILED"));
});

test("BM25 failure falls back to vector candidates and marks degraded response", async () => {
  const service = new MongoSearchService(
    {
      searchBm25: async () => {
        throw new Error("Atlas BM25 search failed");
      },
      searchVector: async () => [vectorHits[0]!],
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async (_query, candidates) => [
        {
          resumeId: candidates[0]!.resumeId,
          rank: 1,
          relevanceScore: 0.9,
          reason: "Matched vector evidence.",
        },
      ],
      summarizeCandidateFit: async () => "unused",
    },
  );

  const result = await service.endToEndSearch("DeepEval architect", {});

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.resumeId, "000000000000000000000002");
  assert.deepEqual(result.results[0]?.sources, ["vector"]);
  assert.equal(result.degraded, true);
  assert.equal(result.bm25Fallback, true);
  assert.ok(result.warnings.includes("BM25_SEARCH_FAILED"));
});

test("rerank failure orders BM25 candidates before vector-only candidates", async () => {
  const diagnostics: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    diagnostics.push(args);
  };
  const service = new MongoSearchService(
    {
      searchBm25: async () => bm25Hits,
      searchVector: async () => vectorHits,
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async () => {
        throw new LLMOutputError("GROQ_MALFORMED_JSON");
      },
      summarizeCandidateFit: async () => "unused",
    },
  );

  try {
    const result = await service.endToEndSearch(
      "QA architect",
      {},
      { finalTopK: 5 },
      "test-request-id",
    );

    assert.deepEqual(
      result.results.map((candidate) => candidate.resumeId),
      [
        "000000000000000000000001",
        "000000000000000000000002",
        "000000000000000000000003",
      ],
    );
    assert.deepEqual(result.results[1]?.sources, ["bm25", "vector"]);
    assert.deepEqual(
      result.results.map((candidate) => candidate.rank),
      [1, 2, 3],
    );
    assert.equal(result.degraded, true);
    assert.ok(result.warnings.includes("LLM_RERANK_FAILED"));
    assert.deepEqual(diagnostics, [
      [
        "Candidate reranking failed",
        {
          requestId: "test-request-id",
          errorType: "LLMOutputError",
          errorCode: "GROQ_MALFORMED_JSON",
        },
      ],
    ]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("summary failures keep ranked candidates and report degradation", async () => {
  const diagnostics: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    diagnostics.push(args);
  };
  const service = new MongoSearchService(
    {
      searchBm25: async () => [bm25Hits[0]!],
      searchVector: async () => [],
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async (_query, candidates) => [
        {
          resumeId: candidates[0]!.resumeId,
          rank: 1,
          relevanceScore: 0.9,
          reason: "Matched candidate evidence.",
        },
      ],
      summarizeCandidateFit: async () => {
        throw new LLMOutputError("SUMMARY_BATCH_INVALID_ITEM");
      },
    },
  );

  try {
    const result = await service.endToEndSearch(
      "RAG architect",
      {},
      { summarize: true },
      "summary-request-id",
    );

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.resumeId, "000000000000000000000001");
    assert.equal(result.results[0]?.summary, undefined);
    assert.equal(result.degraded, true);
    assert.ok(result.warnings.includes("SUMMARIZATION_FAILED"));
    assert.deepEqual(diagnostics, [
      [
        "Candidate summarization failed",
        {
          requestId: "summary-request-id",
          errorType: "LLMOutputError",
          errorCode: "SUMMARY_BATCH_INVALID_ITEM",
          failureCount: 1,
        },
      ],
    ]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("summarizes final candidates sequentially to avoid concurrent provider bursts", async () => {
  let activeSummaries = 0;
  let maximumActiveSummaries = 0;
  const service = new MongoSearchService(
    {
      searchBm25: async () => bm25Hits,
      searchVector: async () => vectorHits,
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async (_query, candidates) =>
        candidates.map((candidate, index) => ({
          resumeId: candidate.resumeId,
          rank: index + 1,
          relevanceScore: 0.9 - index * 0.1,
          reason: "Matched candidate evidence.",
        })),
      summarizeCandidateFit: async (_query, candidate) => {
        activeSummaries += 1;
        maximumActiveSummaries = Math.max(
          maximumActiveSummaries,
          activeSummaries,
        );
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeSummaries -= 1;
        return `Summary for ${candidate.resumeId}`;
      },
    },
  );

  const result = await service.endToEndSearch(
    "QA architect",
    {},
    { finalTopK: 3, summarize: true },
  );

  assert.equal(result.results.length, 3);
  assert.ok(result.results.every((candidate) => candidate.summary));
  assert.equal(maximumActiveSummaries, 1);
  assert.equal(result.degraded, false);
});

test("uses one summary batch for up to five final candidates", async () => {
  let batchCalls = 0;
  let individualCalls = 0;
  const service = new MongoSearchService(
    {
      searchBm25: async () => bm25Hits,
      searchVector: async () => vectorHits,
    },
    { generateQueryEmbedding: async () => [0.1] },
    {
      rerankCandidates: async (_query, candidates) =>
        candidates.map((candidate, index) => ({
          resumeId: candidate.resumeId,
          rank: index + 1,
          relevanceScore: 0.9 - index * 0.1,
          reason: "Matched candidate evidence.",
        })),
      summarizeCandidateFit: async () => {
        individualCalls += 1;
        return "Individual summary.";
      },
      summarizeCandidateFits: async (_query, candidates) => {
        batchCalls += 1;
        return candidates.map((candidate) => ({
          resumeId: candidate.resumeId,
          summary: `Summary for ${candidate.resumeId}`,
        }));
      },
    },
  );

  const result = await service.endToEndSearch(
    "QA architect",
    {},
    { finalTopK: 5, summarize: true },
  );

  assert.equal(batchCalls, 1);
  assert.equal(individualCalls, 0);
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every((candidate) => candidate.summary));
  assert.equal(result.degraded, false);
});

test("both retrieval failures throw the controlled unavailable error", async () => {
  const service = new MongoSearchService(
    {
      searchBm25: async () => {
        throw new Error("BM25 failed");
      },
      searchVector: async () => [],
    },
    {
      generateQueryEmbedding: async () => {
        throw new Error("Embedding failed");
      },
    },
    {
      rerankCandidates: async () => [],
      summarizeCandidateFit: async () => "unused",
    },
  );

  await assert.rejects(
    service.endToEndSearch("RAG architect", {}),
    (error: unknown) => {
      assert.ok(error instanceof SearchUnavailableError);
      assert.ok(Number.isFinite(error.retrievalTimings?.bm25Ms));
      assert.ok(Number.isFinite(error.retrievalTimings?.embeddingMs));
      assert.equal(error.retrievalTimings?.vectorMs, 0);
      return true;
    },
  );
});
