# Resume RAG Application — Phase 2: Backend Retrieval
## Complete Phase-wise Implementation Guide

> **Prerequisite:** Complete `01_Resume_Ingestion_Phasewise_Implementation.md` first.
>
> **Execution rule:** Retrieval is Phase 2. It starts only after at least one resume has been successfully ingested, parsed, embedded, stored in MongoDB, and verified.
>
> **Codebase rule:** Do not create a new project or a second server. Add retrieval to the **same Node.js + TypeScript + Express codebase** and reuse the same MongoDB database, `resumes` collection, environment configuration, middleware, logging, and Mistral embedding integration.

---

# 1. Purpose

Build the retrieval layer of the Resume RAG application on top of the already completed ingestion backend.

The retrieval pipeline must:

1. Accept a recruiter/learner search query.
2. Generate an embedding for the query on demand.
3. Search existing resumes with BM25.
4. Search the already-ingested resume embeddings with MongoDB Atlas Vector Search.
5. Run both search paths independently.
6. Merge and deduplicate candidates.
7. Re-rank the top candidates with Groq LLM.
8. Optionally summarize candidate fit.
9. Return the final ranked result.
10. Gracefully fall back when a component fails.

This document preserves the original RAG retrieval architecture while reorganizing it into explicit implementation phases and verification gates.

---

# 2. Prerequisite Contract from Ingestion

Before Retrieval Phase 1, the following must already exist in MongoDB:

```json
{
  "_id": "...",
  "rawText": "...",
  "name": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "company": "...",
  "role": "...",
  "education": "...",
  "totalExperience": 13,
  "relevantExperience": null,
  "skills": ["RAG", "DeepEval", "MCP (Model Context Protocol)"],
  "jobTitles": ["Test Architect & Senior Agentic Test Engineer"],
  "experienceSummary": "...",
  "embedding": [0.01, -0.03],
  "embeddingModel": "mistral-embed",
  "embeddingDimension": 1024
}
```

## Mandatory prerequisite check

Retrieval cannot proceed if stored resume embeddings are missing.

Recommended internal startup check:

```text
MongoDB resumes count > 0
AND
at least one resume has non-empty embedding
AND
embedding dimension matches configured model
```

---

# 3. High-Level Retrieval Architecture

```text
Client Search Request
        ↓
Express API
        ↓
SearchService
   ┌────┴─────────┐
   ↓              ↓
BM25 Search    Query Embedding
   ↓              ↓
Atlas Search   Vector Search
   └────┬─────────┘
        ↓
Merge + Deduplicate
        ↓
Top N Candidates
        ↓
Groq LLM Re-Ranking
        ↓
Optional Fit Summaries
        ↓
Final Ranked Response
```

---

# 4. Same-Codebase Folder Structure

Add the retrieval module to the application created during ingestion:

```text
resume-rag-backend/
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   └── database.ts
│   │
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logger.ts
│   │   └── errorHandler.ts
│   │
│   ├── modules/
│   │   ├── ingestion/
│   │   │   └── ... already completed
│   │   │
│   │   └── retrieval/
│   │       ├── routes/
│   │       │   └── retrievalRoutes.ts
│   │       ├── controllers/
│   │       │   └── retrievalController.ts
│   │       ├── services/
│   │       │   ├── SearchService.ts
│   │       │   ├── LLMService.ts
│   │       │   └── RetrievalValidationService.ts
│   │       ├── repositories/
│   │       │   └── ResumeRepository.ts
│   │       ├── utils/
│   │       │   ├── deduplicate.ts
│   │       │   └── candidateMapper.ts
│   │       └── types/
│   │           └── retrieval.types.ts
│   │
│   └── shared/
│       └── services/
│           └── EmbeddingService.ts
│
├── tests/
├── .env
├── package.json
└── tsconfig.json
```

## Important reuse rule

The query embedding code should reuse the Mistral `EmbeddingService` already proven during ingestion.

During ingestion:

```text
resume text → embedding → MongoDB
```

During retrieval:

```text
search query → embedding → vector comparison against stored resume embeddings
```

---

# 5. Environment Variables

Continue using the same `.env`.

```env
PORT=3000

MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
MONGODB_DB_NAME=resume_rag

MISTRAL_API_KEY=YOUR_KEY
MISTRAL_EMBED_MODEL=mistral-embed
EMBEDDING_DIMENSION=1024

GROQ_API_KEY=YOUR_KEY
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

RETRIEVAL_DEFAULT_TOP_K=20
RERANK_DEFAULT_TOP_N=10
SEARCH_P95_TARGET_MS=5000
```

---

# 6. Key Retrieval Decisions

Preserve these architecture rules:

- Low traffic, result-quality focused.
- P95 around 3–5 seconds is acceptable.
- Single-node Express application.
- Query embedding is generated on demand.
- Resume embeddings come from the completed ingestion pipeline.
- BM25 searches full resume text and structured metadata.
- Vector search uses MongoDB Atlas Vector Search with ANN.
- Exact re-score can be applied to top vector candidates.
- BM25 and vector searches run independently.
- Hybrid endpoint returns both result lists for debugging.
- Final authority on ranking is the LLM re-ranker.
- Re-rank top 8–10 candidates by default, configurable.
- Summaries are optional.
- Entire end-to-end request is synchronous.
- Fallback priority must preserve usable search results.
- URL-based versioning: `/v1/...`.
- Structured JSON logs include component timings.
- Request/response size limits must be enforced.

---

# 7. Phase-by-Phase Implementation

# PHASE 1 — Retrieval Readiness Check

## Goal

Prove that ingestion has completed and retrieval has usable data.

## Create

```text
src/modules/retrieval/services/RetrievalValidationService.ts
```

## Endpoint

```http
GET /v1/search/readiness
```

## Learner request

```bash
curl http://localhost:3000/v1/search/readiness
```

## Expected response

```json
{
  "ready": true,
  "collection": "resumes",
  "resumeCount": 1,
  "resumesWithEmbedding": 1,
  "embeddingModel": "mistral-embed",
  "embeddingDimension": 1024
}
```

## Failure response

```json
{
  "ready": false,
  "reason": "No ingested resume embeddings are available"
}
```

## Verify

- Retrieval refuses to claim readiness without ingested resumes.
- Stored embedding dimensions are compatible.
- Same MongoDB connection is used.

## Phase gate

```text
ready = true → Continue
ready = false → Return to ingestion guide
```

---

# PHASE 2 — Retrieval Module Scaffold

## Goal

Create the retrieval module without changing the ingestion implementation.

## Create

```text
src/modules/retrieval/
├── routes/retrievalRoutes.ts
├── controllers/retrievalController.ts
├── services/SearchService.ts
├── services/LLMService.ts
├── services/RetrievalValidationService.ts
├── repositories/ResumeRepository.ts
├── utils/deduplicate.ts
├── utils/candidateMapper.ts
└── types/retrieval.types.ts
```

## Register route

In the existing `src/app.ts`:

```ts
app.use("/v1", retrievalRoutes);
```

## Verify

- Existing `/v1/resume/inject` still works.
- Existing health endpoints still work.
- Retrieval routes compile.
- One `npm run dev` process serves both modules.

---

# PHASE 3 — Shared Query Embedding Endpoint

## Goal

Generate a Mistral embedding for a recruiter search query.

## Shared service

Reuse:

```text
src/shared/services/EmbeddingService.ts
```

or reuse the already-tested ingestion `EmbeddingService` and refactor it to shared code only after tests remain green.

## Endpoint

```http
POST /v1/embeddings
```

## Learner request

```json
{
  "model": "mistral-embed",
  "input": "senior agentic QA architect with RAG, DeepEval and MCP experience"
}
```

## Expected response

```json
{
  "embedding": [0.012, -0.044, 0.008],
  "model": "mistral-embed",
  "dimension": 1024
}
```

> The displayed vector is shortened.

## Verify

- Query vector is numeric.
- Dimension matches stored resume vectors.
- No resume embedding is regenerated here.
- Query embeddings are on demand.

---

# PHASE 4 — Resume Repository

## Goal

Create retrieval-only database queries against the existing `resumes` collection.

## File

```text
src/modules/retrieval/repositories/ResumeRepository.ts
```

## Responsibilities

- Read from `resumes`.
- BM25 queries.
- Vector queries.
- Filter by experience or metadata.
- Fetch candidate snippets for LLM re-ranking.
- Never mutate ingestion records during normal search.

## Verify

A simple repository method can fetch the ingested sample resume by `_id`.

---

# PHASE 5 — Atlas Search / BM25

## Goal

Implement lexical search over resume text and metadata.

## Search fields

Use BM25 across:

```text
rawText
skills
jobTitles
experienceSummary
role
company
```

The original architecture specifically requires:

```text
full text + skills + job titles + experience summary
```

## Atlas Search index

Create/configure an Atlas Search index for the fields above.

## Endpoint

```http
POST /v1/search/bm25
```

## Learner request

```json
{
  "query": "agentic QA architect RAG MCP DeepEval",
  "topK": 20,
  "filters": {
    "minYearsExperience": 10
  }
}
```

## Expected response

```json
{
  "mode": "bm25",
  "query": "agentic QA architect RAG MCP DeepEval",
  "count": 1,
  "results": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Rajesh Mohan Kumar",
      "role": "Test Architect & Senior Agentic Test Engineer",
      "score": 8.41,
      "matchedSkills": ["RAG", "DeepEval", "MCP (Model Context Protocol)"]
    }
  ]
}
```

## Verify

- Search can find the sample resume using words present in its skills/title.
- `minYearsExperience` filters correctly.
- Results are sorted by BM25 relevance.
- Endpoint does not call the LLM.

---

# PHASE 6 — MongoDB Vector Search

## Goal

Use the query embedding to find semantically similar resumes.

## Vector source

```text
Query
  ↓
Mistral EmbeddingService
  ↓
1024-dimensional query vector
  ↓
Atlas Vector Search
  ↓
stored resume `embedding`
```

## Vector index

Create a MongoDB Atlas vector index against:

```text
embedding
```

with:

```text
dimensions: 1024
similarity: cosine
```

## Endpoint

```http
POST /v1/search/vector
```

## Learner request

```json
{
  "query": "senior engineer who has built safe RAG and LLM evaluation systems",
  "topK": 20
}
```

## Expected response

```json
{
  "mode": "vector",
  "count": 1,
  "results": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Rajesh Mohan Kumar",
      "role": "Test Architect & Senior Agentic Test Engineer",
      "vectorScore": 0.88
    }
  ]
}
```

## Optional exact re-score

For top vector candidates:

```text
ANN top K
   ↓
fetch stored vectors
   ↓
exact cosine score
   ↓
reorder top K
```

## Verify

- Query embedding and stored resume embeddings use the same model/dimension.
- Vector search finds conceptually related resumes even when wording differs.
- Vector failures are controlled and logged.

---

# PHASE 7 — SearchService BM25 + Vector Methods

## Goal

Introduce service-layer orchestration without hybrid behavior yet.

## File

```text
src/modules/retrieval/services/SearchService.ts
```

## Methods

```ts
bm25Search(query, filters, topK)

vectorSearch(query, filters, topK)
```

## Verify

Each method can be tested independently and returns a normalized candidate shape.

Recommended normalized candidate:

```ts
interface SearchCandidate {
  resumeId: string;
  name?: string;
  role?: string;
  company?: string;
  skills?: string[];
  snippet?: string;
  bm25Score?: number;
  vectorScore?: number;
  sources: ("bm25" | "vector")[];
}
```

---

# PHASE 8 — Hybrid Search

## Goal

Run lexical and semantic retrieval independently and in parallel.

## Method

```ts
hybridSearch(query, filters, options)
```

## Required flow

```text
                    ┌→ BM25 Search
Query + Filters ────┤
                    └→ Vector Search
                       ↑
                 Query Embedding

Run independently / parallel
```

## Endpoint

```http
POST /v1/search/hybrid
```

## Learner request

```json
{
  "query": "agentic QA architect with RAG evaluation",
  "topK": 20,
  "filters": {
    "minYearsExperience": 10
  }
}
```

## Expected response

```json
{
  "mode": "hybrid-debug",
  "bm25": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Rajesh Mohan Kumar",
      "score": 8.41
    }
  ],
  "vector": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Rajesh Mohan Kumar",
      "score": 0.88
    }
  ],
  "timings": {
    "bm25Ms": 80,
    "embeddingMs": 150,
    "vectorMs": 70
  }
}
```

## Important rule

Do not merge BM25 and vector scores into one mathematical score at this stage.

This endpoint is primarily for debugging and exploration.

## Verify

- Both searches execute.
- Same resume can appear in both lists.
- BM25 and vector scores remain separate.
- Timings are returned/logged.

---

# PHASE 9 — Merge + Deduplicate Candidates

## Goal

Create one candidate pool for LLM re-ranking.

## Utility

```text
src/modules/retrieval/utils/deduplicate.ts
```

## Deduplication key

Use:

```text
resumeId
```

## Candidate merge example

Input:

```text
BM25:
A, B, C

Vector:
B, D, A
```

Output pool:

```text
A, B, C, D
```

and preserve source metadata:

```json
{
  "resumeId": "A",
  "sources": ["bm25", "vector"]
}
```

## Verify

- No duplicate resume reaches the re-ranker.
- Source provenance is retained.
- Candidate snippets are size-controlled before LLM usage.

---

# PHASE 10 — Groq LLM Service

## Goal

Implement LLM re-ranking, summarization, and metadata support.

## File

```text
src/modules/retrieval/services/LLMService.ts
```

## Model

```text
meta-llama/llama-4-scout-17b-16e-instruct
```

via Groq API, configurable in `.env`.

## Required methods

```ts
rerankCandidates(query, candidates, topK)

summarizeCandidateFit(query, candidate, options)

extractMetadata(rawText)
```

### `rerankCandidates`

- Input: query + candidate snippets.
- Re-rank top N candidates.
- Default N: 8–10.
- Final ranking is LLM-driven.
- Require structured JSON output.
- Validate returned resume IDs.
- Never allow the model to invent a candidate not present in input.

### `summarizeCandidateFit`

Options:

```text
style: "short" | "detailed"
maxTokens: number
```

### `extractMetadata`

May support metadata normalization at query-time, but ingestion metadata remains the stored source available for retrieval.

---

# PHASE 11 — LLM Re-Ranking Endpoint

## Goal

Verify LLM ordering separately before full pipeline orchestration.

## Endpoint

```http
POST /v1/search/rerank
```

## Learner request

```json
{
  "query": "Need a senior QA architect experienced in RAG, DeepEval, MCP and enterprise GenAI governance",
  "candidates": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "snippet": "Test Architect with 13+ years, RAG, DeepEval, MCP, Agentic QA System, LLM Evaluation..."
    }
  ],
  "topK": 10
}
```

## Expected response

```json
{
  "results": [
    {
      "resumeId": "691db80aa895776f97b6eca6",
      "rank": 1,
      "relevanceScore": 0.96,
      "reason": "Strong match for senior agentic QA, RAG, evaluation and governance requirements."
    }
  ],
  "model": "meta-llama/llama-4-scout-17b-16e-instruct"
}
```

## Verify

- Returned IDs are a subset of input IDs.
- No hallucinated resume is introduced.
- Output schema is valid.
- Invalid LLM JSON is handled.
- Re-rank failure can trigger fallback later.

---

# PHASE 12 — Candidate Summarization

## Goal

Generate optional candidate-fit summaries.

## Endpoint

```http
POST /v1/search/summarize
```

## Learner request

```json
{
  "query": "Senior QA architect with GenAI RAG and evaluation experience",
  "candidate": {
    "resumeId": "691db80aa895776f97b6eca6",
    "snippet": "13+ years ... RAG ... DeepEval ... MCP ... Agentic QA System ..."
  },
  "style": "short",
  "maxTokens": 150
}
```

## Expected response

```json
{
  "resumeId": "691db80aa895776f97b6eca6",
  "summary": "Strong fit for a senior QA/GenAI architecture role, with extensive automation leadership plus direct RAG, DeepEval, MCP and agentic QA experience."
}
```

## Verify

- Summary is grounded only in supplied candidate data.
- Style/length options are enforced.
- Summarization failure does not fail the search result itself.

---

# PHASE 13 — Full End-to-End Search Service

## Goal

Build the final synchronous search pipeline.

## Method

```ts
endToEndSearch(query, filters, options)
```

## Final flow

```text
1. Validate request
2. Generate query embedding
3. Run BM25 search
4. Run vector search
5. Merge results
6. Deduplicate by resumeId
7. Select top N candidates
8. LLM re-rank
9. Optionally summarize
10. Return final ranked results
```

## Recommended optimization

BM25 and vector search should run in parallel where practical.

The query embedding is needed for vector search but not BM25.

Conceptually:

```text
BM25 --------------------------┐
                              ├→ Merge → Deduplicate → Re-rank
Embedding → Vector Search -----┘
```

---

# PHASE 14 — Final Search Endpoint

## Endpoint

```http
POST /v1/search
```

## Learner request

```json
{
  "query": "Senior agentic QA architect with RAG, MCP, DeepEval, API automation and Azure DevOps experience",
  "filters": {
    "minYearsExperience": 10
  },
  "options": {
    "bm25TopK": 20,
    "vectorTopK": 20,
    "rerankTopN": 10,
    "finalTopK": 5,
    "summarize": true,
    "summaryStyle": "short"
  }
}
```

## Expected response

```json
{
  "query": "Senior agentic QA architect with RAG, MCP, DeepEval, API automation and Azure DevOps experience",
  "results": [
    {
      "rank": 1,
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Rajesh Mohan Kumar",
      "role": "Test Architect & Senior Agentic Test Engineer",
      "company": "Testleaf Software Solutions Private Limited",
      "totalExperience": 13,
      "skills": [
        "RAG",
        "DeepEval",
        "MCP (Model Context Protocol)",
        "Postman",
        "REST Assured",
        "Azure DevOps"
      ],
      "sources": ["bm25", "vector"],
      "summary": "Strong fit for senior agentic QA architecture, combining long-term automation experience with RAG, LLM evaluation, MCP and enterprise governance."
    }
  ],
  "degraded": false,
  "warnings": [],
  "timings": {
    "embeddingMs": 150,
    "bm25Ms": 85,
    "vectorMs": 75,
    "rerankMs": 420,
    "summarizeMs": 210,
    "totalMs": 850
  }
}
```

---

# PHASE 15 — Fallback Logic

## Goal

Search should degrade gracefully rather than fail unnecessarily.

## Required fallbacks

### LLM re-rank failure

```text
BM25 + Vector candidates available
        ↓
LLM fails
        ↓
Fallback ordering:
BM25 priority, then vector
```

Response marker:

```json
{
  "degraded": true,
  "warnings": ["LLM_RERANK_FAILED"]
}
```

### Vector failure

Use BM25 only:

```json
{
  "degraded": true,
  "vectorFallback": true
}
```

### BM25 failure

Use vector only:

```json
{
  "degraded": true,
  "bm25Fallback": true
}
```

### Summarization failure

Return ranked results without summaries:

```json
{
  "degraded": true,
  "warnings": ["SUMMARIZATION_FAILED"]
}
```

### Both BM25 and vector fail

Return controlled service error:

```json
{
  "success": false,
  "errorCode": "SEARCH_UNAVAILABLE",
  "message": "No retrieval strategy is currently available"
}
```

---

# PHASE 16 — Logging + Timings

## Goal

Log the complete retrieval pipeline with request IDs.

## Required log shape

```json
{
  "requestId": "abc123",
  "endpoint": "/v1/search",
  "method": "POST",
  "durationMs": 1234,
  "statusCode": 200,
  "componentTimings": {
    "embeddingMs": 200,
    "bm25Ms": 300,
    "vectorMs": 250,
    "rerankMs": 450,
    "summarizeMs": 0
  }
}
```

## Verify

- Same request ID middleware used by ingestion is reused.
- Each fallback is logged.
- Model/API secrets are never logged.
- Full resume text should not be dumped into normal production logs.

---

# PHASE 17 — Payload + Validation Controls

## Goal

Protect synchronous APIs from malformed or oversized requests.

## Required validation

- `query` is required.
- Trim empty query.
- Enforce query maximum length.
- Cap `topK`.
- Cap `rerankTopN`.
- Validate filter types.
- Validate summary style.
- Enforce request body size limit.
- Return HTTP 413 for oversized payloads.
- Candidate IDs supplied to `/rerank` must be validated.

## Example invalid request

```json
{
  "query": ""
}
```

## Expected response

```json
{
  "success": false,
  "errorCode": "INVALID_SEARCH_QUERY",
  "message": "Search query is required"
}
```

---

# PHASE 18 — Automated Tests

## Unit tests

- candidate deduplication
- candidate mapping
- filter validation
- BM25 result normalization
- vector result normalization
- LLM output schema validation
- fallback ordering

## Integration tests

- `/v1/search/readiness`
- `/v1/embeddings`
- `/v1/search/bm25`
- `/v1/search/vector`
- `/v1/search/hybrid`
- `/v1/search/rerank`
- `/v1/search/summarize`
- `/v1/search`

## End-to-end test using the ingested sample resume

### Step 1

Ensure the sample PDF has already been ingested.

### Step 2

Send:

```json
{
  "query": "Senior QA architect with RAG, DeepEval and MCP experience",
  "options": {
    "summarize": true
  }
}
```

### Step 3

Verify:

```text
HTTP 200
  ↓
At least one result
  ↓
Rajesh Mohan Kumar appears for the provided sample dataset
  ↓
sources contains bm25 and/or vector
  ↓
LLM rank is valid
  ↓
summary is grounded
```

---

# 8. Endpoint Implementation Order

Implement exactly in this order:

1. `GET /v1/search/readiness`
2. `POST /v1/embeddings`
3. `POST /v1/search/bm25`
4. `POST /v1/search/vector`
5. `POST /v1/search/hybrid`
6. Deduplicate/merge utility
7. `POST /v1/search/rerank`
8. `POST /v1/search/summarize`
9. `POST /v1/search`
10. Fallbacks
11. Logging/timings
12. Tests

Do not jump directly to `/v1/search`.

Each lower-level API proves one part of the pipeline before the next phase is added.

---

# 9. Retrieval Verification Checklist

- [ ] Ingestion completion gate is already green.
- [ ] Same `npm run dev` backend hosts ingestion and retrieval.
- [ ] `GET /v1/search/readiness` returns `ready: true`.
- [ ] Query embedding works.
- [ ] Query embedding dimension matches resume embedding dimension.
- [ ] BM25 index exists and returns expected results.
- [ ] Vector index exists and returns expected results.
- [ ] Hybrid endpoint exposes both ranked lists.
- [ ] Candidate deduplication works by `resumeId`.
- [ ] LLM re-ranker returns only supplied candidates.
- [ ] Summarization is optional and grounded.
- [ ] Full `/v1/search` works.
- [ ] Vector failure falls back to BM25.
- [ ] BM25 failure falls back to vector.
- [ ] Re-rank failure produces usable fallback ordering.
- [ ] Summarization failure does not remove results.
- [ ] Structured logs include component timings.
- [ ] Unit and integration tests pass.

---

# 10. Complete Application Architecture After Both Documents

```text
                           ONE CODEBASE
                               │
                     ONE EXPRESS BACKEND
                         npm run dev
                         PORT 3000
                               │
              ┌────────────────┴────────────────┐
              │                                 │
       INGESTION MODULE                  RETRIEVAL MODULE
              │                                 │
        Resume PDF                        Search Query
              │                                 │
        Extract Text                      Query Embedding
              │                                 │
        Clean + Parse                ┌──────────┴──────────┐
              │                      │                     │
        Metadata + Skills         BM25 Search         Vector Search
              │                      │                     │
       Resume Embedding               └─────────┬───────────┘
              │                                  │
        MongoDB `resumes`                 Merge + Deduplicate
              │                                  │
              └──────── source data ─────────────┤
                                                 │
                                           LLM Re-Rank
                                                 │
                                         Optional Summary
                                                 │
                                           Final Response
```

---

# 11. Final Endpoints

## Shared / health

```text
GET  /v1/health
GET  /v1/health/db
POST /v1/embeddings
```

## Ingestion

```text
GET  /v1/resume/health
POST /v1/resume/upload
POST /v1/resume/extract
POST /v1/resume/clean
POST /v1/resume/skills
POST /v1/resume/parse
POST /v1/resume/llm-parse
POST /v1/resume/embed
POST /v1/resume/store
POST /v1/resume/inject
```

## Retrieval

```text
GET  /v1/search/readiness
POST /v1/search/bm25
POST /v1/search/vector
POST /v1/search/hybrid
POST /v1/search/rerank
POST /v1/search/summarize
POST /v1/search
```

---

# 12. Final Rule for Learners

Do not treat these MD files as two independent projects.

Use them as one sequential build:

```text
01 Ingestion Guide
    ↓
Complete every phase
    ↓
Verify stored resume + embedding
    ↓
Pass ingestion gate
    ↓
02 Retrieval Guide
    ↓
Complete every search component
    ↓
Verify fallback + end-to-end search
    ↓
Application complete
```

The implementation objective is not simply to create endpoints. The learner must prove each phase with its request, expected response, MongoDB result, and test checkpoint before moving forward.
