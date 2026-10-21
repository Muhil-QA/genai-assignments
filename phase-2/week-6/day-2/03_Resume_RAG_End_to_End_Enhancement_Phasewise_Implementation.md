# Resume RAG Application — End-to-End Enhancement

## Phase-wise Implementation and Validation Guide

> **Purpose:** Complete the home assignment by integrating and verifying the existing resume retrieval pipeline, presenting its results clearly, and applying organization branding without replacing working application behavior.
>
> **Implementation rule:** Work on one phase at a time. At each phase gate, stop and provide the validation steps and observed results. Continue only after the learner confirms the phase passed.
>
> **Repository rule:** Extend the existing backend and `recruitbot-web` frontend in this repository. Do not create a second application, change existing API routes, or remove ingestion, candidate-profile, vector-search, or BM25-search functionality.
>
> **Evidence rule:** Do not claim a feature, test, or live integration works until it has been exercised and verified. Never put API keys, MongoDB credentials, or unredacted candidate personal information in screenshots, prompts, logs, or this document.

---

# 1. Assignment Scope

The assignment asks for:

- Re-ranking of retrieved resumes.
- Deduplication of repeated candidates.
- Summaries of final results.
- A complete end-to-end search flow.
- Clear presentation of relevant candidate results.
- Organization-specific name, logo, colors, professional responsive UI, and useful loading, validation, success, and error feedback.
- End-to-end testing and submission evidence: a phase-wise implementation file, prompt file, application/result screenshots, and repository link.

This repository already contains a backend ingestion/retrieval implementation and a React/Vite frontend. Therefore, this guide treats the existing functionality as the starting point and calls for changes only where inspection and validation show they are needed.

## Known starting point

- Backend: Node.js, TypeScript, Express, MongoDB.
- Frontend: React, TypeScript, Vite, in `recruitbot-web/`.
- Existing product name in the UI: **RecruitBot** (configurable using `VITE_APP_NAME`).
- Existing ingestion page: `/ingestion`.
- Existing candidate search page: `/`.
- Existing end-to-end route: `POST /v1/search`.
- Existing search modes: vector, BM25 keyword, and hybrid.
- The hybrid UI currently calls the end-to-end route, but sends only `options.finalTopK`; the backend supports an optional summary flag, so the UI must request summaries if they are to be shown in normal hybrid searches.
- The hybrid weight controls are present in the UI, but the backend search contract does not accept custom BM25/vector weights. Do not describe those weights as affecting ranking unless the contract is intentionally changed and tested.
- Existing result cards already support some candidate fields and display a summary when one is returned.
- The organization brand supplied for this assignment is **Codeboard**, with a `</>` mark, white background, and blue text. No separate logo image asset or exact color value has been supplied.
- The earlier local health check returned `DB_CONNECTION_FAILED` / `EBADRESP`. On 2026-10-16, `GET /v1/health/db` returned HTTP 200 and `GET /v1/search/readiness` reported 181 resumes with compatible 1024-dimensional embeddings. The DNS issue is not currently reproducing; a running `/v1/health` alone still does not establish database or search readiness.

These points are observations of the current codebase, not claims that the current local services are operational.

---

# 2. Non-Negotiable Behavior and Change Controls

1. Preserve the current backend routes and response contracts unless a failing acceptance check demonstrates a necessary change.
2. Keep ingestion and candidate profile lookup working while improving retrieval.
3. Keep standalone vector and BM25 modes available. Use the existing end-to-end hybrid route for the complete retrieval/rerank/summary pipeline.
4. Do not duplicate backend capabilities in the frontend or implement a second search pipeline.
5. Do not send secrets to the browser, commit them, or include them in screenshots or prompts.
6. Do not invent candidate details. Display only fields supplied by the API; omit unavailable fields.
7. Do not show an LLM relevance score unless the API actually returns one. The current final search response includes rank, candidate details, sources, optional summary, degraded status, warnings, and timings; it does not return a rerank relevance score.
8. Show degraded results and warnings as degraded/incomplete; never present a fallback as a fully healthy search.
9. Avoid printing raw provider errors or sensitive query/candidate contents to user-visible logs.
10. Preserve the existing mobile/responsive behavior and keyboard accessibility while making layout or branding changes.
11. After each phase, run its validation steps and stop. Do not start the next phase before explicit learner confirmation.
12. Never replace an existing file wholesale without inspecting and preserving its unrelated working behavior.

---

# 3. Existing Application Architecture

```text
                         One repository
                              │
             ┌────────────────┴────────────────┐
             │                                 │
       Express backend                  React/Vite frontend
       src/server.ts                    recruitbot-web/
       npm run dev                       npm run dev
             │                                 │
     ┌───────┴────────┐                  ┌─────┴─────────┐
     │                │                  │               │
 Ingestion       Retrieval            Search UI      Ingestion UI
     │                │                  │               │
     │        ┌───────┴────────┐         │               │
     │        │                │         │               │
     │     BM25 search     Query embedding                │
     │                         │                          │
     │                    Vector search                   │
     │        └────────┬───────┘                          │
     │                 │                                  │
     │        Merge and deduplicate                       │
     │                 │                                  │
     │        LLM re-rank candidates                      │
     │                 │                                  │
     │        Optional candidate summaries                │
     │                 │                                  │
     └────────────── MongoDB `resumes` ───────────────────┘
                              │
                         Final results
```

## Relevant existing backend areas

```text
src/
├── app.ts
├── config/
│   ├── database.ts
│   └── env.ts
├── modules/
│   ├── ingestion/
│   └── retrieval/
│       ├── controllers/retrievalController.ts
│       ├── repositories/ResumeRepository.ts
│       ├── services/SearchService.ts
│       ├── services/LLMService.ts
│       ├── services/RetrievalValidationService.ts
│       ├── utils/deduplicate.ts
│       └── types/retrieval.types.ts
└── middleware/
    ├── errorHandler.ts
    └── logger.ts
```

## Relevant existing frontend areas

```text
recruitbot-web/src/
├── config/api.config.ts
├── lib/api/search.api.ts
├── lib/stores/search.store.ts
├── hooks/use-search.ts
├── pages/ChatPage.tsx
├── components/features/search/
│   ├── ResultsList.tsx
│   ├── ResultCard.tsx
│   └── ResultSummary.tsx
├── components/features/chat/
├── components/layout/
├── features/ingestion/
└── AppShell.css
```

---

# 4. Current API Contract

All endpoints below are mounted under `/v1`. Keep route names and backend validation intact during frontend integration.

## Health and readiness

| Method and path            | Purpose                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`           | Confirms the Express process responds; it does not check MongoDB.                                                                      |
| `GET /v1/health/db`        | Checks MongoDB connectivity and the `resumes` collection.                                                                              |
| `GET /v1/search/readiness` | Checks for stored embeddings compatible with configured model and dimension. It does not prove the Atlas vector index itself is ready. |

## Search routes

| Method and path             | Purpose                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/search/vector`    | Embeds a query and returns vector-search candidates. Request: `query`, optional `topK` (default 20; range 1–100), optional boolean `exactRescore`.                     |
| `POST /v1/search/bm25`      | Keyword search. Request: `query`, optional `topK` (default 20; range 1–100), optional `filters`.                                                                       |
| `POST /v1/search/hybrid`    | Debug route returning independent BM25 and vector results and timings.                                                                                                 |
| `POST /v1/search/rerank`    | Standalone reranking route; accepts query and candidate snippets.                                                                                                      |
| `POST /v1/search/summarize` | Standalone candidate-fit summary route.                                                                                                                                |
| `POST /v1/search`           | End-to-end retrieval, merging/deduplication, reranking, optional summaries, fallback metadata, and timings. This is the route for the complete hybrid user experience. |
| `GET /v1/candidate/:id`     | Loads a candidate profile for the existing profile modal.                                                                                                              |

## End-to-end request

```http
POST /v1/search
Content-Type: application/json
```

```json
{
  "query": "Senior QA engineer with RAG and LLM evaluation experience",
  "filters": {
    "minYearsExperience": 5
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

`filters` may be omitted. `options` may be omitted; the backend applies its own defaults. Supported end-to-end option keys are `bm25TopK`, `vectorTopK`, `rerankTopN`, `finalTopK`, `summarize`, `summaryStyle`, `summaryMaxTokens`, and `exactVectorRescore`, subject to backend validation.

The current frontend should preserve its selected result limit and request summaries for the end-to-end mode, for example by sending `options: { finalTopK: selectedLimit, summarize: true }`. Do not send the sidebar's hybrid weights: the current API does not accept them.

## End-to-end response shape

```json
{
  "query": "Senior QA engineer with RAG and LLM evaluation experience",
  "results": [
    {
      "rank": 1,
      "resumeId": "691db80aa895776f97b6eca6",
      "name": "Candidate name from stored record",
      "role": "Role from stored record",
      "company": "Company from stored record",
      "totalExperience": 8,
      "skills": ["RAG", "LLM evaluation"],
      "sources": ["bm25", "vector"],
      "summary": "Optional summary when requested and generated"
    }
  ],
  "degraded": false,
  "warnings": [],
  "timings": {
    "embeddingMs": 0,
    "bm25Ms": 0,
    "vectorMs": 0,
    "rerankMs": 0,
    "summarizeMs": 0,
    "totalMs": 0
  }
}
```

The values above are an illustrative response shape, not expected measured timings or guaranteed candidate content.

## Existing fallback behavior to preserve

- If one retrieval branch fails but another succeeds, the backend can return available results with `degraded: true` and warnings such as `BM25_SEARCH_FAILED` or `VECTOR_SEARCH_FAILED`.
- If both retrieval branches fail, the backend returns an unavailable response rather than successful empty results.
- If reranking fails, the backend returns fallback-ranked candidates and marks the result degraded.
- If optional summaries fail, candidates remain available and the response is marked degraded with `SUMMARIZATION_FAILED`.
- A normal response may have no candidates; render the existing empty state rather than inventing results.

---

# 5. Phase Gates

Each phase is an independent learner checkpoint. Complete only the current phase, report its validation outcome, then wait for confirmation.

---

# PHASE 0 — Baseline, Readiness, and Brand Inputs

## Goal

Establish the current working baseline, confirm infrastructure prerequisites, and collect the actual organization brand inputs before changing functionality or visual identity.

## Work

1. Start backend and frontend using the existing project instructions.
2. Check `GET /v1/health`, `GET /v1/health/db`, and `GET /v1/search/readiness`.
3. Run baseline backend and frontend build/lint/test commands. Record failures that existed before changes; do not silently attribute them to later phases.
4. Confirm that search modes, ingestion route/page, and candidate profile modal are present.
5. Confirm the organization display name, approved logo asset, brand colors, and any typography guidance. Do not infer the organization name from candidate documents or invent a logo.
6. Record which sample/test resumes may be used for screenshots and whether candidate PII must be redacted.

## Validation checkpoint

- [ ] `GET /v1/health` returns HTTP 200.
- [ ] `GET /v1/health/db` returns HTTP 200.
- [ ] `GET /v1/search/readiness` returns `ready: true`, or the specific prerequisite preventing readiness is recorded.
- [ ] Backend build/tests and frontend build/lint results are recorded.
- [ ] Existing ingestion, vector, BM25, hybrid search, and candidate profile flows have not been removed.
- [ ] Brand name/logo/colors are confirmed from an authorized source, or the current RecruitBot identity is explicitly retained.

## Previous blocker and current status

The previously reported MongoDB failure (`DB_CONNECTION_FAILED`, `EBADRESP`) was not reproduced during Phase 0 validation on 2026-10-16: `/v1/health/db` returned HTTP 200 and search readiness was true for 181 resumes. Phase 0 was accepted by the learner. A healthy database does not by itself prove that retrieval indexes or LLM providers work.

## Stop condition

Stop here and report the baseline and any blockers. Continue only after the learner confirms the baseline and supplies/approves branding details.

---

# PHASE 1 — Verify the Existing End-to-End Backend Pipeline

## Goal

Prove that the existing API already performs retrieval, deduplication, re-ranking, and summaries before changing frontend behavior. Fix backend defects only if a verification check demonstrates one.

## Work

1. Confirm MongoDB and embedding readiness from Phase 0.
2. Verify Atlas BM25 and vector indexes are configured for the names and schema expected by the current backend. In the inspected Atlas deployment, the READY BM25 index is named `BM25_index` and the READY vector index is named `resume_vector_index`.
3. Send a small `POST /v1/search` request with `finalTopK` and `summarize: true`.
4. Verify returned results contain unique `resumeId` values, have ranks, and include only fields actually returned by the API.
5. When provider/API configuration permits, verify summaries are present. Record degraded warnings accurately if reranking or summaries fall back.
6. Exercise existing `/v1/search/bm25`, `/v1/search/vector`, and `/v1/search/readiness` separately to distinguish a pipeline issue from a frontend issue.

## Validation checkpoint

- [ ] End-to-end search returns HTTP 200 for a valid query when infrastructure/providers are ready.
- [ ] `results` is an array; every result has a unique `resumeId` and valid rank.
- [ ] `sources` contains only source labels returned by the backend (`bm25` and/or `vector`).
- [ ] Summary behavior matches `options.summarize`; provider failures are represented by degraded metadata/warnings.
- [ ] No fake candidate, rank, score, or summary is introduced.
- [ ] Any backend code change is supported by a failing test or reproducible defect and does not change unrelated route behavior.

## Stop condition

Stop after backend verification and report the actual response status, result count, degraded flag, and warnings (without candidate PII or secrets). Wait for confirmation before frontend integration.

## Phase 1 findings (2026-10-16)

- The application fallback BM25 index name was `resume_retrieval_bm25`, but the connected Atlas cluster's READY index is `BM25_index`. With the old name, the repository returned no matches. The backend default and `.env.example` now use `BM25_index`; an explicit `MONGODB_BM25_SEARCH_INDEX` environment value still overrides that default.
- Against a fresh app instance using the corrected configuration, `POST /v1/search/bm25` for `RAG` returned five scored candidates; `POST /v1/search/hybrid` returned five BM25 and five vector candidates with component timings.
- Backend build passed. Focused retrieval/integration tests passed (36/36), and the complete backend suite passed (125/125), including the Atlas BM25, hybrid, deduplication, reranking, summary, and end-to-end contract tests.
- The currently running backend process must be restarted to load the corrected default before browser/Postman verification.
- Synthetic Groq diagnostics showed successful calls as well as an intermittent HTTP 429 rate-limit response and an empty-summary response. These are provider/runtime outcomes, not a deterministic code failure. The live application must be rechecked with synthetic candidate data after the provider limit clears; end-to-end tests that stub the LLM do not prove live Groq availability.

## Learner validation steps before Phase 2

1. Stop and restart the backend so it loads the updated BM25 index default.
2. In Postman or another HTTP client, send `POST http://localhost:3000/v1/search/bm25` with JSON `{"query":"RAG","topK":5}`. Confirm HTTP 200, a positive `count`, and finite `score` values.
3. Send `POST http://localhost:3000/v1/search/hybrid` with JSON `{"query":"agentic QA architect with RAG evaluation","topK":5}`. Confirm HTTP 200, non-empty `bm25` and `vector` arrays, and finite `bm25Ms`, `embeddingMs`, and `vectorMs` values.
4. To check Groq without sending real resume details, send `POST http://localhost:3000/v1/search/rerank` with JSON `{"query":"QA engineer with RAG","candidates":[{"resumeId":"000000000000000000000001","snippet":"Synthetic test profile: QA engineer with RAG evaluation experience."}],"topK":1}`. Confirm HTTP 200 and one result, or record the returned `errorCode` if the provider is still rate-limited.
5. Send `POST http://localhost:3000/v1/search/summarize` with JSON `{"query":"QA engineer with RAG","candidate":{"resumeId":"000000000000000000000001","snippet":"Synthetic test profile: QA engineer with RAG evaluation experience."},"style":"short","maxTokens":150}`. Confirm HTTP 200 and a non-empty `summary`, or record the returned `errorCode`.
6. Share only the status codes, counts, warning/error codes, and whether a summary was present. Do not share candidate names, profile data, API keys, or MongoDB connection strings.

Do not begin Phase 2 until the learner reports these checks and confirms to proceed. If Groq is still rate-limited, the search/index parts can be confirmed separately; record the LLM limitation rather than presenting the live full pipeline as verified.

---

# PHASE 2 — Integrate the End-to-End API in the Existing Frontend

## Goal

Make the current hybrid search choice use the complete end-to-end backend pipeline and ask for optional summaries while keeping vector and BM25 modes unchanged.

## Likely integration points

- `recruitbot-web/src/lib/api/search.api.ts`
- `recruitbot-web/src/types/search.types.ts`
- `recruitbot-web/src/hooks/use-search.ts`
- Existing result components only as needed to represent fields and status.

## Work

1. Preserve vector mode's call to `POST /v1/search/vector`.
2. Preserve BM25 mode's call to `POST /v1/search/bm25`.
3. Keep hybrid mode on `POST /v1/search`.
4. In hybrid mode, pass the selected final result count and request summaries (`summarize: true`).
5. Type the API response based on the actual backend response; preserve `degraded`, `warnings`, and timings.
6. Keep API failures in a visible error state. Do not convert network/API failures into an empty successful result.
7. Preserve `GET /v1/candidate/:id` selection/profile behavior and ingestion UI.

## Validation checkpoint

- [ ] TypeScript/build succeeds.
- [ ] A selected vector search still calls the vector route.
- [ ] A selected BM25 search still calls the BM25 route.
- [ ] A selected hybrid search calls `/v1/search` with `finalTopK` and `summarize: true`.
- [ ] API response fields are represented without unsafe type coercion or guessed values.
- [ ] API failure produces visible error feedback; the UI does not display stale results as the new query's success.
- [ ] Candidate profile selection still opens the existing profile modal.

## Stop condition

Stop and provide the route/payload verification results. Wait for confirmation before changing result presentation or visual design.

## Phase 2 implementation note

Hybrid mode already called `POST /v1/search` and passed the selected `finalTopK`; it now also passes `summarize: true`. The existing API response mapping retains summaries, degradation, warnings, and total duration. Vector and BM25 modes continue calling their existing dedicated routes with the same query and `topK`. No backend route or request schema changed.

Local browser validation observed:

- Hybrid: `POST /v1/search`, HTTP 200, `finalTopK: 5`, `summarize: true`, five results rendered; response was degraded with `VECTOR_SEARCH_FAILED`, `LLM_RERANK_FAILED`, and `SUMMARIZATION_FAILED`, and no summaries were returned in that request.
- Vector: `POST /v1/search/vector`, HTTP 200, `topK: 5`, five results.
- BM25: `POST /v1/search/bm25`, HTTP 200, `topK: 5`, five results.
- Frontend build and ESLint passed. Oxlint completed with two existing Fast Refresh warnings in `src/components/ui/button.tsx` and `src/components/ui/badge.tsx`. Prettier check passed.

The degraded hybrid response is evidence the UI preserves backend fallback warnings, not evidence that every live retrieval/LLM provider succeeded. It does not block verification of this phase's frontend request routing.

## Learner validation steps before Phase 3

1. Start/restart the backend, then start the frontend.
2. Select **Hybrid Search**, submit a query, and confirm the backend terminal logs `POST /v1/search`. In the UI, confirm results or the existing empty/error state appear.
3. Select **Vector Search**, submit a new query, and confirm the backend terminal logs `POST /v1/search/vector`; confirm the UI shows the response.
4. Select **BM25 Keyword**, submit a new query, and confirm the backend terminal logs `POST /v1/search/bm25`; confirm the UI shows the response.
5. If browser DevTools is available, additionally inspect the Hybrid request: `options.finalTopK` should match the selected result limit and `options.summarize` should be `true`; Vector and BM25 requests should carry `query` and `topK`. DevTools is optional when its panels do not render.
6. Confirm a candidate result still opens its profile modal.

Stop after these checks and report the observed routes, whether each search showed results, and any status/error codes visible in the backend logs. Wait for learner confirmation before Phase 3.

---

# PHASE 3 — Present Ranked, Deduplicated, Summarized Results Clearly

## Goal

Show useful fields returned by the end-to-end route in readable result cards and make degraded/fallback behavior understandable.

## Work

1. Show final rank, candidate name, role, company, experience when present, skills, and source labels.
2. Render `summary` when present. If no summary is returned, do not fabricate one; use the existing available candidate fields.
3. Show result count and elapsed time using response timings when available.
4. Keep warning/degraded feedback visible when `degraded` is true; render available fallback results without implying every retrieval branch succeeded.
5. Keep a clear empty state when the API succeeds with zero results.
6. Maintain a unique React key and candidate selection by `resumeId`. Confirm backend deduplication; do not silently hide distinct candidates using name-only matching.
7. Do not show a relevance score that the end-to-end response does not contain. Standalone vector/BM25 scores may continue to appear in their existing modes.
8. Keep the result card keyboard accessible and provide meaningful accessible labels.

## Validation checkpoint

- [ ] A successful end-to-end response displays only fields provided by the API.
- [ ] Summary text appears for results that contain it.
- [ ] Duplicate `resumeId` values do not produce duplicate cards; candidates with different IDs are not merged merely because names match.
- [ ] Degraded responses show a warning and still show any returned results.
- [ ] Empty responses show the empty state.
- [ ] Candidate profile modal still opens from a result card by keyboard and pointer.
- [ ] No unsupported rerank score or invented data is displayed.

## Stop condition

Stop after verifying normal, empty, and degraded result states. Wait for confirmation before organization branding and responsive polish.

## Phase 3 implementation note

- Result cards now show the backend-provided retrieval sources as Keyword and/or Semantic match badges.
- Returned summaries have a clearly labeled candidate-fit summary block. When no summary is present, the UI falls back to the provided snippet without inventing a summary.
- Degraded responses retain the general incomplete-results notice and now translate recognized backend warning codes into specific user-facing explanations. Unknown warning codes do not expose raw internal codes.
- The API adapter removes repeated `resumeId` values while preserving first-seen order. Different IDs remain separate even when names match.
- Empty results still use the existing empty state. Existing rank, candidate fields, selectable profile cards, vector/BM25 score display, and keyboard operation are preserved.

Local browser validation used synthetic API responses:

- Synthetic routes used to test UI states were removed before real API validation. The shared browser page previously retained a mock for `/v1/search`; it was cleared and the application page reloaded against the real backend. The learner later confirmed Phase 2 by verifying all three search modes in the app and backend terminal logs; Phase 3 validation remains pending.
- Three entries containing a duplicate ID and two distinct IDs with the same display name rendered as two cards; both distinct IDs remained visible.
- Keyword/Semantic source badges and a returned summary rendered.
- Vector, reranking, and summary failure warnings rendered as specific messages.
- An empty response showed the empty state with zero cards in the current result section.
- Keyboard Enter on a result opened the candidate profile modal.
- Frontend production build passed with the existing >500 kB bundle-size warning; ESLint and Prettier passed. Oxlint completed with the existing two Fast Refresh warnings in `button.tsx` and `badge.tsx`.

## Learner validation steps before Phase 4

1. Start the frontend and backend and run a hybrid search that returns results. Confirm each card shows its rank, provided candidate details, skills, and Keyword/Semantic source badge(s). If the API returns a summary, confirm it appears under **Candidate fit summary**.
2. In Network → `POST /v1/search`, inspect the response. If `degraded` is true, confirm the UI shows the incomplete-results notice and a readable explanation for each recognized warning. Do not expect a summary if `SUMMARIZATION_FAILED` is present.
3. Search for a query that returns no matches (or use the existing empty-state behavior) and confirm the latest result section says **No candidates found**.
4. Confirm a candidate result remains operable by pointer and keyboard, and opens the existing profile modal.
5. Report whether these checks passed and any warnings seen. Do not share candidate PII or credentials. Wait for confirmation before Phase 4.

---

# PHASE 4 — Organization Branding, Responsive Layout, and UX States

## Goal

Apply approved organization branding to the existing UI while preserving RecruitBot/search functionality and ingestion navigation.

## Work

1. Use the organization name, logo asset, and colors confirmed in Phase 0. If those were not supplied, retain the current RecruitBot brand rather than inventing organization identity.
2. Update shared brand elements (sidebar, top bar, app name/title, favicon or logo only when an approved asset is available) consistently.
3. Use the existing design system and CSS patterns. Keep sufficient color contrast and visible focus indicators.
4. Verify the sidebar/search workspace, result cards, profile modal, and ingestion page at desktop, tablet, and narrow mobile widths.
5. Review loading, empty, validation, success, degraded, and error messages:
   - Loading should indicate that a search is in progress and avoid accidental duplicate submissions.
   - Validation should explain invalid or empty input before the request where applicable.
   - Success should reflect the real response and not imply Atlas/index readiness beyond what was checked.
   - Errors should be actionable but must not expose provider secrets, connection strings, or raw stack traces.
6. Ensure long skill lists and summaries wrap without horizontal page overflow.
7. Do not remove existing mode selectors, results-limit control, candidate profile modal, or ingestion link.

## Validation checkpoint

- [ ] Only approved brand assets and values are used.
- [ ] Existing RecruitBot identity is retained if no organization brand was approved.
- [ ] Search and ingestion remain reachable and functional.
- [ ] Loading, input validation, empty, success, degraded, and error states are visible and accurate.
- [ ] At narrow viewport sizes there is no unintended horizontal overflow and controls remain usable.
- [ ] Keyboard focus, button semantics, and text contrast remain usable.
- [ ] Screenshots show no credentials or unapproved candidate PII.

## Phase 4 implementation note

- Applied the approved Codeboard name and `</>` mark consistently in the search sidebar, chat header/welcome message, ingestion navigation, page title, and favicon. No external logo image was supplied; the mark is a simple text-based SVG derived from the approved symbol.
- Used blue `#2563eb` as the primary accent because the approved inputs specified blue but did not provide an exact color value. The application now uses a white/light professional theme with readable dark-blue text; existing RecruitBot search and ingestion features remain in place.
- The search prompt gives visible guidance when empty, prevents blank/duplicate submissions using its existing disabled/loading behavior, and now shows a descriptive search-in-progress status. Results, degraded warnings, errors, and ingestion progress continue to use their existing response-driven states.
- Added responsive layout and text-wrapping safeguards for desktop, tablet, and narrow mobile widths; preserved keyboard focus outlines and reduced-motion support.
- Local browser checks at 1440px, 768px, and 390px found no horizontal overflow on search or ingestion pages. The real vector route returned HTTP 200 with five results at mobile width, and a candidate profile opened. Ingestion remained reachable. Frontend production build, ESLint, and Prettier passed; the existing large JavaScript bundle warning remains.
- Learner confirmed Phase 4 validation successful on 2026-10-16.

## Learner validation steps before Phase 5

1. Open the search page at desktop width. Confirm the Codeboard name, blue `</>` mark, white/light layout, all three search modes, results limit, and ingestion link are present.
2. At a tablet-sized width (about 768px), confirm the sidebar and search workspace remain usable, with no horizontal page scrolling.
3. At a narrow mobile width (about 390px), confirm search-mode buttons, query field, send button, results, and profile modal remain usable and no horizontal page scrolling appears.
4. Submit a normal search. Confirm the loading indicator says that candidates are being searched, then verify results or the existing empty/error state. Check source badges and summaries/fallback snippets as available; if a degraded warning appears, make sure it remains visible and understandable.
5. With the query empty, confirm the helper text explains what to enter and the send button is disabled. Confirm an in-progress search cannot be submitted again.
6. Open `/ingestion` from the sidebar, confirm the Codeboard mark/name and upload page fit on desktop and mobile, then return to candidate search. Do not upload a real resume solely for this phase.
7. Report any failed or unobserved checks. Keep screenshots free of credentials and candidate PII.

## Stop condition

Stop after desktop and mobile-sized browser validation. Wait for confirmation before full end-to-end regression and submission packaging.

---

# PHASE 5 — Complete End-to-End Regression and Assignment Evidence

## Goal

Validate the complete application without regressing ingestion or profile lookup, then prepare accurate assignment deliverables.

## Test sequence

1. Start MongoDB/backend and confirm `/v1/health/db` and `/v1/search/readiness`.
2. Start the frontend and verify the approved application name/logo and responsive layout.
3. Search using hybrid mode with a realistic query and summary enabled.
4. Verify the result list, unique candidate IDs, ranks, source labels, summaries, warnings, and timings against the actual API response.
5. Open a candidate profile.
6. Verify vector and BM25 modes still work independently.
7. Verify no-results and validation/error paths.
8. Verify resume ingestion still works and does not falsely claim vector index readiness.
9. Run backend build and automated tests; run frontend build and lint.
10. Capture screenshots of the application and final results only after successful verification. Use authorized sample data and redact personal data where required.

## Existing repository validation commands

Backend (repository root):

```powershell
npm run build
npm test
```

Frontend (`recruitbot-web`):

```powershell
npm run build
npm run lint
npm run lint:eslint
```

Run targeted test files first when a specific change is made, then the listed regression commands as appropriate. A command that cannot run due to missing packages should be reported; do not claim it passed.

## Submission items

- This phase-wise implementation file.
- A prompt file containing the actual prompts used or approved for the implementation; do not fabricate historical prompts.
- Screenshots showing the branded application and verified final search results.
- The GitHub repository link, once the learner confirms the intended repository and that it is ready to share.

Do not publish screenshots, candidate data, or repository changes to WhatsApp/GitHub without the learner's review and authorization. Do not create or push commits as part of this phase unless explicitly requested.

## Final acceptance checklist

- [x] Search pipeline exercised against the live configured backend and MongoDB.
- [ ] Live LLM re-ranking succeeds in Hybrid mode (no `LLM_RERANK_FAILED` warning) and the final result order is from the reranker, not fallback retrieval order.
- [ ] Live summarization succeeds for every displayed final result (no `SUMMARIZATION_FAILED` warning); a fallback snippet is not a generated summary.
- [x] Retrieval IDs are unique and fallback/degraded states are shown honestly when a provider stage fails.
- [x] Vector and BM25 modes returned results; a real BM25 no-results query showed the empty state.
- [x] Candidate profile opened successfully from a live search result.
- [x] Ingestion page was reachable and automated ingestion integration tests passed.
- [ ] A live resume upload was not performed; no approved test resume was selected for a database write.
- [x] Responsive layout and relevant search input, empty, degraded, and validation states reviewed.
- [x] Backend build/tests and frontend build/lint outcomes recorded.
- [x] Prompt file and screenshots are based on supplied prompts and verified application behavior; candidate details are redacted in the results screenshot.
- [ ] Repository link/review authorization has not been supplied; no GitHub/WhatsApp upload or commit was made.

## Phase 5 execution record

**Live service readiness**

- `GET /v1/health`: HTTP 200, `status: ok`.
- `GET /v1/health/db`: HTTP 200, `status: ok`, `connected: true`.
- `GET /v1/search/readiness`: HTTP 200, `ready: true`; collection `resumes`, 181 resumes and 181 resumes with embeddings, model `mistral-embed`, dimension 1024.

**Live UI/API checks**

- Vector: `POST /v1/search/vector`, HTTP 200, five results and five unique resume IDs.
- BM25: `POST /v1/search/bm25`, HTTP 200, five results and five unique resume IDs.
- Hybrid: `POST /v1/search`, HTTP 200, five results and five unique resume IDs; request included `options.finalTopK: 5` and `options.summarize: true`. Timings on the recorded run: BM25 126 ms, embedding 729 ms, vector 138 ms, reranking 230 ms, summarization 586 ms, total 1684 ms.
- The hybrid response was degraded with `LLM_RERANK_FAILED` and `SUMMARIZATION_FAILED`. It returned one candidate summary out of five on the recorded run; the UI showed the provider warning and fallback content for results without summaries. Do not report live reranking as successful; candidates were returned in fallback retrieval order.
- These two assignment requirements are **not yet accepted as complete**. The existing service calls are wired, but the recorded live run did not verify successful re-ranking or complete summaries. A fallback rank/order or a resume snippet is not a substitute for either feature.
- Follow-up diagnostic change (2026-10-16): the end-to-end service now writes safe backend diagnostics for LLM-stage failures, correlated by request ID. For `GroqApiError`, logs include provider HTTP status, provider code, and provider type; they never include the API key, query, candidate ID, or raw provider message. Restart the backend after updating the code. To capture a fresh request in browser DevTools, open Network first, select Fetch/XHR, then submit a search; DevTools does not backfill requests made before it opened. The browser Network entry proves the request and shows its response; inspect the VS Code backend terminal for the matching provider diagnostic. The existing failure record above remains the current observed outcome until a new live run passes.
- Token-limit mitigation (2026-10-16): LLM candidate context is capped at 500 snippet characters and 12 skills of at most 80 characters; rerank output budget was reduced to 400 tokens; final summaries are requested in batches of at most five candidates using one provider call per batch, with an output cap of 500 tokens per batch. Backend build passed and all 129 tests passed. A live post-change Hybrid request still returned HTTP 200 with five candidates but `LLM_RERANK_FAILED` and `SUMMARIZATION_FAILED`, and zero summaries. The subsequent user diagnostic again showed Groq HTTP 413, `rate_limit_exceeded`, type `tokens`, with four of five summary calls failing on that observed run. The `.env` file configures `GROQ_MODEL=openai/gpt-oss-safeguard-20b`, a model described by Groq as intended for safety-classification tasks; it is not the general instruction model in `.env.example`. The model override has not been changed. Failure logs now include sanitized `retry-after`, token limit, remaining-token, and token-reset headers when Groq supplies them. These code/config observations do not prove quota exhaustion or model incompatibility caused the exact 413. Check the signed-in Groq organization Limits page and the next sanitized diagnostics. Assignment remains incomplete until live Hybrid returns successful reranking and a summary for every displayed result without provider-failure warnings.
- Model ID correction (2026-10-16): the follow-up diagnostic returned HTTP 404 `model_not_found`. The local `.env` was configured with `meta-llama/llama-4-scout-17b-16e-instruct`, which Groq's deprecation documentation lists with a shutdown date of July 17, 2026 and recommends migrating to `openai/gpt-oss-120b` or `qwen/qwen3.6-27b`. Updated local `GROQ_MODEL` and `.env.example` to `openai/gpt-oss-120b`; corrected `.env.example` so `GROQ_API_KEY` is the `YOUR_KEY` placeholder. The actual key value had been present in the example file and must be revoked/rotated in the Groq Console; replace the local `.env` key with the new key before any live LLM test. Do not record or share either key. Backend build and focused LLM/end-to-end tests passed (21/21), but no live test was performed after changing the model because the exposed credential must first be rotated. Re-test after key rotation and backend restart. This model correction addresses the evidenced 404 cause; prior 413 token-limit errors may still recur and must be handled separately if observed.
- JSON-format correction and live validation status (2026-10-16): with `openai/gpt-oss-120b`, Groq returned HTTP 400 `json_validate_failed` for reranking, even after the existing strict-prompt retry; its response included token limit 8000, remaining tokens 3876, and reset 30.929s. Changed reranking and batched summaries to request plain text with explicit JSON instructions, parse locally, validate all IDs/fields, and retry once on malformed JSON; metadata extraction retains Groq JSON mode. Backend build passed and all 129 tests passed. A browser Hybrid request after the source edit still returned both failure warnings, five unique candidates, and zero summaries; however, the backend process version for that request was not confirmed. The subsequent diagnostics supplied by the learner were the same earlier request (`1f27eefe-863c-4685-ac9b-b920b887ba59`), so they do not diagnose the later run or confirm the updated backend was loaded. Restart backend before making a fresh Hybrid request; then inspect its new request-correlated diagnostics. Do not mark assignment complete until a fresh live run succeeds without warnings and every displayed result has a generated summary.
- Latest diagnostic (request `fe152a1d-0415-440f-8af2-825c3d7ed25d`): reranking and five summaries failed with generic `Error` and no provider status/code, so Groq's exact returned failure remains unproven. Added safe internal `LLMOutputError` codes for malformed JSON, invalid response shape, and invalid candidate IDs; logs now include only the enumerated error code rather than model output, query, or candidate data. Build passed and all 129 backend tests passed. This diagnostic-code change was made after that request, so restart backend and run a fresh Hybrid search to see whether the failure is malformed JSON, invalid model output, or another cause. Continue to require a successful live rerank and a summary for every displayed result before marking complete.
- Fresh live diagnostic (request `1bb5bc96-f3e3-4bdd-a86e-5523b05e146a`, 2026-10-16): reranking failed with `GROQ_MALFORMED_JSON`; the search response warning list contained `LLM_RERANK_FAILED` and did not list `SUMMARIZATION_FAILED`. The current parser retries malformed plain-text JSON once with the same 400-token limit, which may be insufficient for ten scored candidates with reasons. Updated the retry to double its bounded token budget (up to 1200) and constrained rerank reasons to at most eight words. This is a targeted mitigation, not proof of cause or live success; repeat Hybrid search after backend restart. Verify the actual summaries and no warnings before acceptance.
- Follow-up live diagnostic (request `752fc365-f318-4143-8974-e922c8d80c1d`, 2026-10-17): reranking still failed with `GROQ_MALFORMED_JSON` after the bounded larger-token retry; the warning list contained `LLM_RERANK_FAILED` only. It does not establish whether the response was wrapped in markdown/text or syntactically invalid/truncated. Added extraction of a balanced JSON object from surrounding text before the existing strict retry; parsed data remains subject to the same schema and candidate-ID validation. Backend build passed, and all 130 tests passed. This is not proof of live success; restart backend and verify a new Hybrid request and all summaries.
- Follow-up live diagnostic (request `976eefac-b727-4cd3-8fa9-efd50fe1357b`, 2026-10-17): reranking again failed with `GROQ_MALFORMED_JSON` after the wrapper-tolerant parser change; the warning list contained `LLM_RERANK_FAILED` only. Groq's documentation lists strict JSON Schema output as supported for `openai/gpt-oss-120b`. Updated reranking and batched-summary requests to use strict schemas (`additionalProperties: false`, all properties required) while retaining local schema/ID validation; single-candidate free-text summaries and metadata extraction keep their existing formats. This is the first code change aimed at preventing malformed provider output rather than recovering it. Build/tests and a new live request are still required; do not claim the issue fixed until a fresh request passes.
- Strict-schema live diagnostic (request `24d5c196-a1b0-41aa-a772-df298c99c624`, 2026-10-17): Groq returned HTTP 400 `json_validate_failed` for both reranking and batch summaries; the response contained available-token headers (5734 for rerank and 4487 for summaries), so this is not evidence of token exhaustion. Removed numeric bound keywords from the strict schema (range validation remains local) and added a single bounded retry using Groq JSON Object Mode if strict-schema validation is rejected. The fallback result is still locally parsed and fully validated; provider errors remain visible if it fails. Backend build passed and all 131 tests passed. This diagnostic also reveals the strict-output path is not live-healthy; rerun after backend restart.
- Latest live diagnostic (request `29d2d777-5e5f-41fb-a59a-b37956241cea`, 2026-10-19): reranking still returned HTTP 400 `json_validate_failed` after the strict-schema/JSON Object Mode path. Token headers showed 3415 tokens remaining, so this does not point to token exhaustion. Removed structured output modes from reranking and batched summaries, replacing JSON with compact tab-separated text rows; IDs, score ranges, uniqueness, row counts, and summary coverage remain validated locally. This avoids the provider response-format validation that has blocked the live pipeline. Backend build and tests must pass, then a new live Hybrid request must verify the change.
- Implementation validation: reranking now requests three tab-separated columns (resume ID, score, reason), and batch summaries request resume ID plus summary. Both avoid Groq JSON response formats; IDs, score bounds, uniqueness, all candidate rows, and summary coverage are checked locally. Full backend suite passed 132/132 and TypeScript build passed. A fresh live request is still required to confirm provider compatibility.
- Latest live diagnostic (request `842e6a9b-d892-4c72-9fd5-f45936f7f07b`, 2026-10-19): reranking returned `RERANK_INVALID_RESPONSE`, while the POST warning list contained only `LLM_RERANK_FAILED`. In the current reranker, this code is raised when the provider's text completion is empty/whitespace after trimming. Changed `requestText` to retry an empty completion once with an explicit non-empty instruction and doubled but bounded output budget; if still empty it now reports the safe `GROQ_NO_CONTENT` code. Added a test for the empty-then-valid retry. Build passed and all 132 backend tests passed. Restart backend and confirm with a new Hybrid request.
- Follow-up live diagnostic (request `4a430540-597d-4996-a750-25e0d35e3d28`, 2026-10-19): reranking returned `GROQ_NO_CONTENT` after the empty-output retry, confirming the configured Groq completion had no usable visible content twice. Groq documentation shows GPT-OSS reasoning effort defaults to medium and supports `reasoning_effort`; its chat API documents `max_completion_tokens`. Updated GPT-OSS calls to low reasoning effort with reasoning hidden, switched from legacy `max_tokens` to `max_completion_tokens`, and increased the bounded rerank/batch-summary completion budgets to 1000/800. Safe `finish_reason` is now attached to empty-content diagnostics when supplied. This addresses likely reasoning-token starvation, but the exact prior finish reason was not captured. Build/tests and a fresh live search are required to verify the fix.
- Latest live diagnostic (request `70d02b83-568a-45a0-b318-bcd72589fbb9`, 2026-10-19): the rerank completion was non-empty but the three-column parser rejected a row as `RERANK_INVALID_CANDIDATE`; the failure log intentionally does not expose candidate/model content, so it cannot identify which column differed. Removed model-generated score/reason requirements from reranking. The model now returns only the supplied resume IDs in rank order; the server ignores non-ID lines, verifies every supplied ID appears exactly once, and assigns rank locally. API score/reason fields are optional and omitted when the model did not supply them; no synthetic score or explanation is fabricated. Build passed, focused/integration tests passed (45/45), and all backend tests passed (133/133). A new live run is required.
- Latest live diagnostic (request `cae11451-2602-4a07-9ca8-3ec440681a65`, 2026-10-19): the ID-only completion was rejected as `RERANK_INVALID_RESPONSE` because the implementation incorrectly required an ID for every rerank candidate, although only the top five are displayed. Changed the rerank contract to request and require exactly `min(finalTopK, candidateCount)` IDs while retaining the larger candidate pool for model comparison. IDs in the displayed top list must still be supplied, unique, and valid; model output for lower-ranked candidates is not required. Added unit and end-to-end coverage for this top-list contract. Backend build passed, focused/integration tests passed (46/46), and the full suite passed (134/134). A fresh live search is still required.
- Successful live validation (2026-10-19): learner confirmed the Hybrid search works successfully as expected after restarting the backend. The corresponding POST `/v1/search` request (`38617c9f-4c56-4f91-8097-1a6627379db1`) completed HTTP 200 with BM25, embedding, vector, reranking, and summarization timings; the terminal log contained no degradation or warning fields. Learner also confirmed validating the results in the UI. Phase 5 runtime acceptance is now confirmed.
- Candidate profile lookup also appeared in the same log: `GET /v1/candidate/...` returned HTTP 304, which means the cached profile representation is unchanged, not that profile retrieval failed. `OPTIONS` 204 entries are browser CORS preflight checks and are expected.
- For all three modes, the UI displayed sequential result ranks and no duplicate resume IDs were returned. The UI adapter’s duplicate filtering remains covered by the earlier Phase 3 synthetic UI checks.
- A real BM25 query with no lexical matches returned HTTP 200 and zero results; the UI displayed the empty state.
- Empty-query UI validation kept the Send button disabled. A direct invalid vector request returned HTTP 400 with `INVALID_SEARCH_QUERY`.
- A candidate profile opened from a search result. The ingestion page and initial upload status were checked, with no resume uploaded. The automated backend suite, including `ingestion.integration.test.ts`, passed.
- Desktop/tablet/mobile widths, responsive behavior, and reduced/empty/degraded UI states were checked in Phase 4. The two saved screenshots are in `submission-evidence/`; candidate fields are blurred in the search-results image.

**Builds and tests**

- Backend `npm run build`: passed.
- Backend `npm test`: 125 passed, 0 failed.
- Frontend `npm run build`: passed; Vite reports the existing >500 kB JavaScript chunk warning.
- Frontend `npm run lint`: passed with the existing Fast Refresh warnings in `button.tsx` and `badge.tsx`.
- Frontend `npm run lint:eslint`: passed.
- Prettier check on changed frontend files: passed.

**Submission status**

- Prompt record: `submission-evidence/Assignment_Prompt.md` contains the learner-provided assignment and phase-gating constraints; it does not reconstruct missing historical prompts.
- Screenshots: `submission-evidence/Codeboard_Home.png` and `submission-evidence/Codeboard_Search_Results_Redacted.png`.
- Learner reviewed and approved the prompt file and screenshots on 2026-10-16.
- No GitHub repository URL was provided, so the intended remote cannot be verified. No files were pushed to GitHub or WhatsApp and no commit was created.
- Prompt/screenshots are approved as evidence, and the learner has confirmed successful live end-to-end Hybrid search after the latest reranking change. Runtime feature acceptance is complete; publishing remains separate and requires the intended GitHub URL and authorization. No approved test resume was provided; no GitHub repository URL was supplied.

## Stop condition

Do not mark the assignment complete while live Hybrid responses contain `LLM_RERANK_FAILED` or `SUMMARIZATION_FAILED`. Diagnose provider failures using the safe backend diagnostics (`requestId`, `providerStatus`, `providerCode`, and `providerType`; never copy or expose API keys or candidate content), make a targeted fix, and repeat the live Hybrid check. Close Phase 5 only after a successful re-ranking run, a generated summary for every displayed final result, unique IDs, no provider-failure warnings, and the existing regression checks still pass. Record the actual test response and results; do not treat fallback content as success. Submission/publishing remains a separate step requiring the intended GitHub URL and authorization.

---

# 6. Architecture and Responsibility Summary

| Concern                          | Existing implementation / planned use                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Resume ingestion and persistence | Existing Express ingestion module and MongoDB `resumes` collection; preserve it.                   |
| Keyword retrieval                | Existing BM25 route and Atlas Search integration.                                                  |
| Semantic retrieval               | Existing query embedding and Atlas Vector Search integration.                                      |
| Candidate merge/deduplication    | Existing end-to-end `SearchService`; verify unique `resumeId` values.                              |
| Re-ranking                       | Existing LLM-backed end-to-end search service; verify rank/fallback behavior.                      |
| Summarization                    | Existing optional end-to-end summary step; frontend must request it to display it.                 |
| API orchestration                | Existing `POST /v1/search`; frontend hybrid mode should consume it.                                |
| Result/profile UI                | Existing React search components and candidate modal; extend rather than replace.                  |
| Organization identity            | Use approved organization assets and values; `VITE_APP_NAME` currently defaults to RecruitBot.     |
| Submission evidence              | Create screenshots and prompt file only from verified work, with privacy and authorization checks. |

---

# 7. Phase Completion Record

Use this section during implementation. Record observed outputs only; do not mark a phase complete based solely on the plan.

| Phase                                          | Status                           | Validation evidence / blocker                                                                                                                                                                                                                                                                                                                                                                                                                                        | Learner confirmation |
| ---------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 0 — Baseline, readiness, and brand inputs      | Accepted by learner (2026-10-16) | Health/db and readiness passed; brand recorded as Codeboard, `</>` mark, white background, blue text.                                                                                                                                                                                                                                                                                                                                                                | Accepted             |
| 1 — Existing end-to-end backend pipeline       | Accepted by learner (2026-10-16) | BM25 index default corrected; backend build passed; focused tests 36/36 and full backend tests 125/125; learner confirmed live Phase 1 validation completed successfully.                                                                                                                                                                                                                                                                                            | Accepted             |
| 2 — Frontend API integration                   | Accepted by learner (2026-10-16) | Learner confirmed Hybrid, Vector, and BM25 searches were validated in the app and all three requests appeared in the VS Code backend terminal logs.                                                                                                                                                                                                                                                                                                                  | Accepted             |
| 3 — Ranked and summarized result presentation  | Accepted by learner (2026-10-16) | Learner confirmed Phase 3 validation completed successfully.                                                                                                                                                                                                                                                                                                                                                                                                         | Accepted             |
| 4 — Branding, responsive layout, and UX states | Accepted by learner (2026-10-16) | Codeboard name/mark and blue-light theme applied; production build, ESLint, Prettier passed. Local desktop/tablet/mobile checks found no horizontal overflow; real search, results, profile opening, and ingestion navigation were checked. Learner confirmed Phase 4 validation successful.                                                                                                                                                                         | Accepted             |
| 5 — Regression and assignment evidence         | Accepted by learner (2026-10-19) | Learner confirmed live Hybrid search now works successfully after backend restart and validated the UI results. The corresponding `POST /v1/search` request (`38617c9f-4c56-4f91-8097-1a6627379db1`) returned HTTP 200 with reranking and summarization timings; the terminal log showed no degraded flag or warnings. Backend build passed and all 134 tests passed. No GitHub URL or publishing authorization supplied; no commit or external submission was made. | Accepted             |
