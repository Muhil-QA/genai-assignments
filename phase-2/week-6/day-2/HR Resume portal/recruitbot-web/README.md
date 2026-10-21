# RecruitBot Web

React/Vite frontend for the existing RecruitBot backend. Resume ingestion UI
requests use `VITE_API_BASE_URL`, which defaults to the local backend at
`http://localhost:3000`. Leaving it empty uses the Vite `/v1` development
proxy.

The retrieval frontend foundation uses a 260px sidebar and a full-height
candidate-search workspace at `/`. Resume ingestion remains available at
`/ingestion`; its feature files and API flow are kept separate from retrieval
state.

## Run locally

1. Start the backend from the repository root with `npm run dev`.
2. In this directory, install dependencies with `npm install` if needed.
3. Start the frontend with `npm run dev`.
4. Open the URL printed by Vite.

Set `VITE_API_BASE_URL` when the backend is hosted at a different origin. When
it is empty, the development server proxy is used.

Development environment defaults are in `.env.development`. Set
`VITE_API_BASE_URL` for the production deployment target in the hosting
environment. `VITE_APP_NAME` controls the displayed product name, and
`VITE_ENABLE_MOCK` defaults to `false`.

Tailwind CSS theme tokens are configured in `tailwind.config.js`. Reusable
shadcn/ui primitives are in `src/components/ui/`, shared Axios setup is in
`src/lib/api/client.ts`, and chat/search/UI state skeletons are in
`src/lib/stores/`.

Run `npm run lint` for Oxlint, `npm run lint:eslint` for ESLint, and
`npm run format:check` to check formatting of the retrieval foundation files.

The ingestion backend contract currently implemented by this repository is
`POST /v1/resume/ingest` with a `multipart/form-data` field named `file`. The
frontend uses that existing contract without changing backend routes or
business logic. The endpoint returns its result only after the full ingestion
request completes; it does not stream individual pipeline-stage events. The
progress UI therefore shows a real uploading/processing state while waiting and
confirms all pipeline stages only after the endpoint returns success.

The ingestion response confirms embedding generation and MongoDB storage for a
new resume. A duplicate response is shown separately because the backend skips
embedding generation for an already-stored resume. The ingestion response does
not confirm Atlas Vector Search index readiness, so the result screen does not
claim that vector search is ready.

## Retrieval search integration

Candidate search uses the backend's implemented `POST /v1/search/vector` and
`POST /v1/search/bm25` routes for their respective modes. Hybrid search uses
`POST /v1/search` with `options.finalTopK`; the backend performs its combined
retrieval and reranking flow. The hybrid route does not accept custom BM25 or
vector weights, so the sidebar's weight values are not applied to searches.

Result cards show only fields returned by each route. BM25 and vector routes
return their respective scores, while the end-to-end hybrid route currently
returns rank and candidate summary fields but not the rerank relevance score.

Selecting a result loads its profile from `GET /v1/candidate/:id`. The profile
response uses fields currently stored by resume ingestion and excludes the raw
resume text, file name, and embedding vector. In particular, the ingestion
schema stores education and experience summary as text; it does not currently
store structured experience entries, projects, or certifications, so the
profile UI does not invent or display those sections.
