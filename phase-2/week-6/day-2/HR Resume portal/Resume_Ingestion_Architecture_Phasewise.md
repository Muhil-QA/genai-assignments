# Resume RAG Application — Phase 1: Backend Resume Ingestion
## Complete Phase-wise Implementation Guide

> **Execution rule:** This is the first implementation document. Complete and verify every ingestion phase before starting the retrieval document.
>
> **Codebase rule:** Ingestion and retrieval must live inside the **same Node.js + TypeScript + Express codebase**, use the **same MongoDB database**, and run from the **same backend server** with `npm run dev`.
>
> **Phase gate:** Do **not** implement retrieval until the final ingestion verification gate passes.

---

# 1. Purpose

Build the backend ingestion foundation for a Resume RAG application.

The ingestion pipeline must accept a resume PDF, extract and clean its text, convert the resume into structured metadata, generate a Mistral embedding, and store the final document in MongoDB so the retrieval pipeline can use it later.

This guide preserves the existing ingestion design and changes the implementation order and folder organization so that:

1. A new application starts with ingestion first.
2. Retrieval is implemented only after ingestion is verified.
3. Both modules remain inside one backend codebase.
4. Every phase can be run and verified independently.
5. A learner can understand what request to send, what response to expect, what to check, and when to move to the next phase.

---

# 2. Technology Stack

- Node.js
- TypeScript
- Express
- MongoDB / MongoDB Atlas
- Mistral Embeddings
- `mistral-embed`
- Multer
- `pdf-parse`
- Optional LLM resume parser
- Groq LLM can be configured later for retrieval/re-ranking

---

# 3. Target Application Architecture

```text
resume-rag-backend/
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── multerConfig.ts
│   │   └── skills.ts
│   │
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logger.ts
│   │   └── errorHandler.ts
│   │
│   ├── modules/
│   │   ├── ingestion/
│   │   │   ├── routes/
│   │   │   │   └── ingestionRoutes.ts
│   │   │   ├── controllers/
│   │   │   │   └── ingestionController.ts
│   │   │   ├── services/
│   │   │   │   ├── ResumeParserService.ts
│   │   │   │   ├── AlgorithmResumeParser.ts
│   │   │   │   ├── LLMResumeParser.ts
│   │   │   │   ├── ResumeIngestionService.ts
│   │   │   │   └── EmbeddingService.ts
│   │   │   ├── repositories/
│   │   │   │   └── ResumeIngestionRepository.ts
│   │   │   ├── utils/
│   │   │   │   ├── regex.ts
│   │   │   │   └── textCleaner.ts
│   │   │   └── types/
│   │   │       └── ingestion.types.ts
│   │   │
│   │   └── retrieval/
│   │       └── README.md
│   │       # Keep this module empty until ingestion is complete.
│   │
│   ├── shared/
│   │   ├── services/
│   │   │   └── EmbeddingService.ts
│   │   └── types/
│   │
│   └── types/
│
├── uploads/
├── tests/
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## Important folder decision

The original design placed ingestion files directly under `src/routes`, `src/services`, and `src/repositories`. The functionality remains the same, but the new application organizes ingestion under:

```text
src/modules/ingestion/
```

This makes it clear that ingestion is Phase 1 of the application while retrieval will later be added as:

```text
src/modules/retrieval/
```

Both still use the same `app.ts`, `server.ts`, environment, MongoDB connection, logging, and process.

---

# 4. Final Backend Flow

```text
START APPLICATION
      ↓
Project + DB + Health
      ↓
Upload PDF
      ↓
Extract Text
      ↓
Clean Text
      ↓
Algorithm / Optional LLM Parsing
      ↓
Skills + Metadata Detection
      ↓
Generate Resume Embedding
      ↓
Store Resume + Metadata + Embedding in MongoDB
      ↓
Verify Stored Resume
      ↓
INGESTION COMPLETE
      ↓
Only now start Retrieval Phase
```

---

# 5. Environment Variables

Create `.env`:

```env
PORT=3000
NODE_ENV=development

MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
MONGODB_DB_NAME=resume_rag

MISTRAL_API_KEY=YOUR_KEY
MISTRAL_EMBED_MODEL=mistral-embed
EMBEDDING_DIMENSION=1024

USE_LLM_PARSER=false

# Optional parser configuration
GROQ_API_KEY=YOUR_KEY
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

MAX_UPLOAD_SIZE_MB=5
```

Create `.env.example` with the same keys but without secrets.

---

# 6. Phase-by-Phase Implementation

# PHASE 1 — Project Scaffold + Shared Backend

## Goal

Create the single backend application that will host both ingestion and retrieval.

## Create

```text
src/app.ts
src/server.ts
src/config/env.ts
src/config/database.ts
src/middleware/requestId.ts
src/middleware/logger.ts
src/middleware/errorHandler.ts
```

## Install base dependencies

```bash
npm init -y
npm install express mongodb dotenv cors uuid
npm install -D typescript ts-node-dev @types/node @types/express @types/cors
npx tsc --init
```

## Required scripts

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest"
  }
}
```

## Required health endpoint

```http
GET /v1/health
```

### Learner request

```bash
curl http://localhost:3000/v1/health
```

### Expected response

```json
{
  "status": "ok",
  "app": "resume-rag-backend",
  "version": "1.0.0",
  "uptime": 12.4
}
```

## Verify before next phase

- `npm run dev` starts without TypeScript errors.
- Port 3000 is listening.
- `/v1/health` returns HTTP 200.
- No retrieval implementation exists yet.

## Phase gate

```text
PASS → Continue to Phase 2
FAIL → Fix project/server configuration before continuing
```

---

# PHASE 2 — MongoDB Connectivity

## Goal

Create one database connection that ingestion and retrieval will share.

## Endpoint

```http
GET /v1/health/db
```

## Learner request

```bash
curl http://localhost:3000/v1/health/db
```

## Expected response

```json
{
  "status": "ok",
  "database": "mongodb",
  "connected": true,
  "latencyMs": 18
}
```

## Failure example

```json
{
  "status": "error",
  "database": "mongodb",
  "connected": false,
  "errorCode": "DB_CONNECTION_FAILED"
}
```

## Verify

- Connection string comes only from `.env`.
- Database connection is reused, not recreated per request.
- A `resumes` collection can be accessed.
- Health endpoint reports connection latency.

## Phase gate

Do not implement PDF upload until database connectivity is working.

---

# PHASE 3 — Ingestion Module Folder Setup

## Goal

Create ingestion as a self-contained module inside the same backend.

## Create

```text
src/modules/ingestion/
├── routes/
│   └── ingestionRoutes.ts
├── controllers/
│   └── ingestionController.ts
├── services/
│   ├── ResumeParserService.ts
│   ├── AlgorithmResumeParser.ts
│   ├── LLMResumeParser.ts
│   ├── ResumeIngestionService.ts
│   └── EmbeddingService.ts
├── repositories/
│   └── ResumeIngestionRepository.ts
├── utils/
│   ├── regex.ts
│   └── textCleaner.ts
└── types/
    └── ingestion.types.ts
```

## Route registration

In `src/app.ts`:

```ts
app.use("/v1", ingestionRoutes);
```

## Verification endpoint

At this phase it is acceptable to expose a temporary module readiness route:

```http
GET /v1/resume/health
```

### Expected response

```json
{
  "status": "ok",
  "module": "resume-ingestion"
}
```

## Phase gate

All ingestion imports and route registration must compile before continuing.

---

# PHASE 4 — Secure PDF Upload

## Goal

Accept PDF resumes safely.

## Install

```bash
npm install multer pdf-parse
npm install -D @types/multer
```

## File

```text
src/config/multerConfig.ts
```

or, if all ingestion-specific configuration is kept local:

```text
src/modules/ingestion/config/multerConfig.ts
```

## Requirements

- Accept only `.pdf` / `application/pdf`.
- Maximum size: 5 MB.
- Use `uploads/` for temporary storage.
- Reject missing files.
- Generate safe temporary names.
- Do not trust client filenames for storage paths.

## Endpoint

```http
POST /v1/resume/upload
```

## Learner request

```bash
curl -X POST \
  http://localhost:3000/v1/resume/upload \
  -F "file=@Rajesh Mohan Kumar_Test Architect & Senior Agentic Test Engineer.pdf"
```

## Expected response

```json
{
  "success": true,
  "message": "Resume uploaded successfully",
  "file": {
    "originalName": "Rajesh Mohan Kumar_Test Architect & Senior Agentic Test Engineer.pdf",
    "mimeType": "application/pdf",
    "size": 123456
  }
}
```

## Invalid file response

```json
{
  "success": false,
  "errorCode": "INVALID_FILE_TYPE",
  "message": "Only PDF files are allowed"
}
```

## Verify

- PDF succeeds.
- TXT/JPG/DOCX fails.
- File above 5 MB fails.
- Missing `file` field fails.
- Temporary file can be removed after processing.

---

# PHASE 5 — PDF Text Extraction

## Goal

Convert uploaded PDF into raw text.

## File

```text
src/modules/ingestion/services/ResumeParserService.ts
```

## Main method

```ts
extractTextFromPdf(filePath: string): Promise<string>
```

## Flow

```text
PDF
 ↓
pdf-parse
 ↓
rawText
```

## Endpoint

```http
POST /v1/resume/extract
```

## Learner request

```bash
curl -X POST \
  http://localhost:3000/v1/resume/extract \
  -F "file=@Rajesh Mohan Kumar_Test Architect & Senior Agentic Test Engineer.pdf"
```

## Expected response shape

```json
{
  "success": true,
  "rawText": "Rajesh Mohan Kumar Test Architect & Senior Agentic Test Engineer ...",
  "characters": 8421
}
```

## Sample content that should be visible from the provided resume

The extraction should contain information such as:

```text
Rajesh Mohan Kumar
Test Architect & Senior Agentic Test Engineer
Selenium WebDriver
Core Java
C#
Python
RAG
DeepEval
MCP (Model Context Protocol)
Testleaf Software Solutions Private Limited
```

## Empty extraction response

```json
{
  "success": false,
  "errorCode": "RESUME_EXTRACTION_FAILED",
  "message": "Resume extraction failed"
}
```

## Verify

- Name/title text is present.
- Skills are present.
- Work experience text is present.
- Empty text is treated as failure.
- Temporary files are cleaned up.

---

# PHASE 6 — Text Cleaning

## Goal

Normalize extracted text before parsing or embedding.

## File

```text
src/modules/ingestion/utils/textCleaner.ts
```

## Responsibilities

- Remove repeated whitespace.
- Normalize line breaks.
- Remove duplicate blank lines.
- Remove unwanted control characters.
- Preserve meaningful symbols in technical skills where possible, for example `C#`, `C++`, `.NET`.
- Avoid destructive cleaning that removes useful resume context.

## Endpoint

```http
POST /v1/resume/clean
```

## Learner request

```json
{
  "rawText": "Rajesh Mohan Kumar\n\n\nTest Architect & Senior Agentic Test Engineer   \n RAG"
}
```

## Expected response

```json
{
  "success": true,
  "cleanText": "Rajesh Mohan Kumar\nTest Architect & Senior Agentic Test Engineer\nRAG"
}
```

## Verify

- Extra spaces disappear.
- Useful technology names remain intact.
- Cleaning does not remove dates, job titles, emails, or technical terms.

---

# PHASE 7 — Regex Utilities

## Goal

Provide reusable deterministic extraction helpers.

## File

```text
src/modules/ingestion/utils/regex.ts
```

## Examples

```ts
export const EMAIL_REGEX =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export const PHONE_REGEX =
  /(\+91[\-\s]?)?[0]?(91)?[789]\d{9}/;

export const EXPERIENCE_REGEX =
  /(\d+(\.\d+)?)\s*(years|yrs)/i;
```

## API

No standalone API is required.

## Unit verification

```text
Input: "13+ years of experience"
Expected numeric extraction: 13
```

## Verify

- Regex utilities have unit tests.
- No endpoint is required.
- Parser consumes these utilities.

---

# PHASE 8 — Skills Dictionary + Detection

## Goal

Detect technical skills deterministically.

## File

```text
src/config/skills.ts
```

or:

```text
src/modules/ingestion/config/skills.ts
```

## Initial skill examples

```ts
export const SKILLS = [
  "Java",
  "Selenium",
  "Playwright",
  "API Testing",
  "Postman",
  "SQL",
  "MongoDB",
  "Jenkins",
  "Python",
  "C#",
  "REST Assured",
  "Cucumber",
  "GenAI",
  "Langchain",
  "Langgraph",
  "RAG",
  "Azure DevOps",
  "AWS Lambda",
  "GitHub",
  "DeepEval",
  "MCP (Model Context Protocol)"
];
```

## Endpoint

```http
POST /v1/resume/skills
```

## Learner request

```json
{
  "rawText": "Experienced in Selenium WebDriver, Python, RAG, DeepEval and MCP (Model Context Protocol)."
}
```

## Expected response

```json
{
  "success": true,
  "skills": [
    "Selenium",
    "Python",
    "RAG",
    "DeepEval",
    "MCP (Model Context Protocol)"
  ]
}
```

## Verify

Run the endpoint against the sample resume and confirm that multiple skills visible in the resume are detected.

---

# PHASE 9 — Algorithm Resume Parser

## Goal

Convert resume text into structured JSON **without requiring an LLM**.

## File

```text
src/modules/ingestion/services/AlgorithmResumeParser.ts
```

## Main method

```ts
parseResume(rawText: string): ParsedResume
```

## Minimum structured schema

```ts
interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  company?: string;
  role?: string;
  education?: string;
  totalExperience?: number;
  relevantExperience?: number;
  skills: string[];
  jobTitles?: string[];
  experienceSummary?: string;
}
```

## Endpoint

```http
POST /v1/resume/parse
```

## Learner request

```json
{
  "rawText": "<cleaned resume text>"
}
```

## Expected response example for the supplied resume

```json
{
  "success": true,
  "resume": {
    "name": "Rajesh Mohan Kumar",
    "role": "Test Architect & Senior Agentic Test Engineer",
    "company": "Testleaf Software Solutions Private Limited",
    "education": "B.Tech - Information Technology",
    "totalExperience": 13,
    "skills": [
      "Selenium WebDriver",
      "Core Java",
      "C#",
      "Python",
      "REST Assured",
      "Postman",
      "RAG",
      "DeepEval",
      "MCP (Model Context Protocol)"
    ]
  }
}
```

> The parser should return only fields it can support from the resume. Missing values should be `null`/omitted rather than invented.

## Verify

- Name is correctly extracted.
- Current title is correctly extracted.
- Current company is correctly extracted.
- Education is captured.
- Total experience is plausible from the source text.
- Skills include multiple known items from the resume.
- Unsupported values are not hallucinated.

---

# PHASE 10 — Optional LLM Parser

## Goal

Allow an LLM parser to be enabled without replacing the deterministic parser architecture.

## File

```text
src/modules/ingestion/services/LLMResumeParser.ts
```

## Environment selection

```env
USE_LLM_PARSER=false
```

## Dynamic selection

```ts
if (process.env.USE_LLM_PARSER === "true") {
  parser = new LLMResumeParser();
} else {
  parser = new AlgorithmResumeParser();
}
```

## Endpoint

```http
POST /v1/resume/llm-parse
```

## Expected disabled behavior

If:

```env
USE_LLM_PARSER=false
```

then either:

```json
{
  "success": false,
  "errorCode": "LLM_PARSER_DISABLED",
  "message": "LLM resume parser is disabled"
}
```

or the application may route parsing through the algorithm parser.

## Verify

- Application runs with LLM parser disabled.
- No LLM key is required for deterministic parsing.
- Enabling the LLM parser is configuration-driven.
- LLM output is schema-validated before acceptance.

---

# PHASE 11 — Mistral Resume Embedding

## Goal

Generate the resume embedding **during ingestion**, before storing the final record.

This is the key handoff that makes later vector retrieval possible.

## Model

```text
mistral-embed
```

## Expected dimension

```text
1024
```

## File

```text
src/modules/ingestion/services/EmbeddingService.ts
```

A shared version can later be moved to:

```text
src/shared/services/EmbeddingService.ts
```

so retrieval can reuse the same Mistral client.

## Embedding input

```ts
const embeddingText = `
${name}
${role}
${skills.join(", ")}
${company}
${experienceSummary ?? ""}
${rawText}
`;
```

## Endpoint

```http
POST /v1/resume/embed
```

## Learner request

```json
{
  "name": "Rajesh Mohan Kumar",
  "role": "Test Architect & Senior Agentic Test Engineer",
  "skills": ["RAG", "DeepEval", "MCP (Model Context Protocol)"],
  "company": "Testleaf Software Solutions Private Limited",
  "rawText": "<cleaned resume text>"
}
```

## Expected response

```json
{
  "success": true,
  "model": "mistral-embed",
  "dimension": 1024,
  "embedding": [0.0123, -0.0311, 0.0048]
}
```

> The real response contains the complete embedding vector. The shortened array above is only to show the response shape.

## Verify

- Mistral API key is loaded from `.env`.
- Returned vector is numeric.
- Vector length equals configured/expected dimension.
- Embedding input contains meaningful resume context.
- API errors are mapped to a stable application error.

---

# PHASE 12 — MongoDB Resume Storage

## Goal

Store structured resume metadata and the generated embedding in the `resumes` collection.

## File

```text
src/modules/ingestion/repositories/ResumeIngestionRepository.ts
```

## Collection

```text
resumes
```

## Recommended final document

```json
{
  "fileName": "resume.pdf",
  "rawText": "Resume content",
  "name": "Rajesh Mohan Kumar",
  "email": null,
  "phone": null,
  "location": null,
  "company": "Testleaf Software Solutions Private Limited",
  "role": "Test Architect & Senior Agentic Test Engineer",
  "education": "B.Tech - Information Technology",
  "totalExperience": 13,
  "relevantExperience": null,
  "skills": [
    "Selenium WebDriver",
    "Core Java",
    "C#",
    "Python",
    "REST Assured",
    "Postman",
    "RAG",
    "DeepEval",
    "MCP (Model Context Protocol)"
  ],
  "jobTitles": [
    "Test Architect & Senior Agentic Test Engineer",
    "Lead Test Engineer"
  ],
  "experienceSummary": "Enterprise QA architecture, GenAI and agentic QA, automation, RAG and LLM evaluation experience.",
  "embedding": [],
  "embeddingModel": "mistral-embed",
  "embeddingDimension": 1024,
  "createdAt": "2026-08-24T00:00:00.000Z",
  "updatedAt": "2026-08-24T00:00:00.000Z"
}
```

## Endpoint

```http
POST /v1/resume/store
```

## Learner request

```json
{
  "fileName": "Rajesh Mohan Kumar_Test Architect & Senior Agentic Test Engineer.pdf",
  "resume": {
    "name": "Rajesh Mohan Kumar",
    "role": "Test Architect & Senior Agentic Test Engineer",
    "skills": ["RAG", "DeepEval", "MCP (Model Context Protocol)"]
  },
  "rawText": "<cleaned resume text>",
  "embedding": [0.01, -0.03, 0.004]
}
```

## Expected response

```json
{
  "success": true,
  "message": "Resume stored successfully",
  "resumeId": "691db80aa895776f97b6eca6"
}
```

## Verify directly in MongoDB

Confirm:

- Document exists in `resumes`.
- `rawText` is not empty.
- `skills` is an array.
- `embedding` is an array.
- Embedding has correct dimensionality.
- `embeddingModel` is present.
- No duplicate insert occurs unintentionally.

---

# PHASE 13 — Full Resume Ingestion Service

## Goal

Orchestrate every ingestion step through one production endpoint.

## File

```text
src/modules/ingestion/services/ResumeIngestionService.ts
```

## Main method

```ts
ingesttResume(file: Express.Multer.File)
```

## Full flow

```text
PDF Upload
   ↓
Validate PDF
   ↓
Extract Text
   ↓
Clean Text
   ↓
Algorithm Parser / Optional LLM Parser
   ↓
Skills + Metadata
   ↓
Generate Mistral Embedding
   ↓
Store in MongoDB
   ↓
Return Resume ID + Parsed Summary
```

## Production endpoint

```http
POST /v1/resume/ingest
```

## Route

```ts
router.post(
  "/resume/ingest",
  upload.single("file"),
  ingestionController.ingestResume
);
```

## Learner request

```bash
curl -X POST \
  http://localhost:3000/v1/resume/ingest \
  -F "file=@Rajesh Mohan Kumar_Test Architect & Senior Agentic Test Engineer.pdf"
```

## Expected response

```json
{
  "success": true,
  "message": "Resume ingestion completed",
  "resumeId": "691db80aa895776f97b6eca6",
  "data": {
    "name": "Rajesh Mohan Kumar",
    "role": "Test Architect & Senior Agentic Test Engineer",
    "company": "Testleaf Software Solutions Private Limited",
    "totalExperience": 13,
    "skillsCount": 10,
    "embeddingModel": "mistral-embed",
    "embeddingDimension": 1024
  },
  "timings": {
    "extractMs": 100,
    "cleanMs": 8,
    "parseMs": 45,
    "embeddingMs": 300,
    "mongoInsertMs": 50,
    "totalMs": 503
  }
}
```

## Verification

After this API succeeds, query MongoDB by returned `resumeId` and verify that the full stored record matches the response and source resume.

---

# PHASE 14 — Error Handling

## Goal

Use stable errors across all ingestion endpoints.

| Case | HTTP | Error Code | Message |
|---|---:|---|---|
| Missing file | 400 | `FILE_REQUIRED` | Resume PDF is required |
| Invalid file | 415 | `INVALID_FILE_TYPE` | Only PDF files are allowed |
| Oversize file | 413 | `FILE_TOO_LARGE` | Resume exceeds maximum upload size |
| Empty resume | 422 | `RESUME_EXTRACTION_FAILED` | Resume extraction failed |
| Parse failure | 422 | `RESUME_PARSE_FAILED` | Resume parsing failed |
| Embedding failure | 502 | `EMBEDDING_FAILED` | Mistral embedding failed |
| MongoDB failure | 500/503 | `INGESTION_FAILED` | Resume ingestion failed |

## Standard error response

```json
{
  "success": false,
  "requestId": "abc123",
  "errorCode": "EMBEDDING_FAILED",
  "message": "Mistral embedding failed"
}
```

---

# PHASE 15 — Logging + Request IDs

## Goal

Make every phase traceable.

## Required structured log

```json
{
  "requestId": "abc123",
  "endpoint": "/v1/resume/ingest",
  "fileName": "resume.pdf",
  "statusCode": 200,
  "extractMs": 100,
  "cleanMs": 8,
  "parseMs": 45,
  "embeddingMs": 300,
  "mongoInsertMs": 50,
  "totalMs": 503
}
```

## Verify

- Every request gets a request ID.
- Errors contain the same request ID.
- Secrets, entire embedding vectors, and sensitive raw payloads are not dumped into normal logs.

---

# PHASE 16 — Automated Tests

## Goal

Prevent retrieval development from starting on an unstable ingestion layer.

## Minimum unit tests

- `textCleaner`
- regex utilities
- skills detection
- algorithm parser
- embedding response validation
- repository insert handling

## Minimum integration tests

- `/v1/health`
- `/v1/health/db`
- invalid PDF upload
- extract endpoint
- parse endpoint
- embed endpoint
- store endpoint
- full `/v1/resume/ingest`

## End-to-end test

```text
Sample PDF
   ↓
POST /v1/resume/ingest
   ↓
HTTP 200
   ↓
resumeId returned
   ↓
MongoDB document exists
   ↓
name/title/skills populated
   ↓
embedding length = 1024
```

---

# 7. Final Ingestion Verification Checklist

Complete every item before opening the retrieval implementation guide.

- [ ] `npm run dev` starts one backend server.
- [ ] `GET /v1/health` passes.
- [ ] `GET /v1/health/db` passes.
- [ ] PDF-only validation works.
- [ ] Resume text is extracted.
- [ ] Text cleaning is correct.
- [ ] Algorithm parser returns structured JSON.
- [ ] Skill detection works.
- [ ] Optional LLM parser does not break default flow.
- [ ] Mistral embedding is generated.
- [ ] Embedding dimension is correct.
- [ ] Resume is stored in MongoDB.
- [ ] `POST /v1/resume/ingest` succeeds end-to-end.
- [ ] Stored data matches the source resume.
- [ ] Request IDs and timings are logged.
- [ ] Error scenarios return controlled responses.
- [ ] Unit/integration tests pass.

---

# 8. Ingestion Completion Gate

Retrieval may start only when the following proof exists:

```json
{
  "ingestionReady": true,
  "server": "same-backend",
  "collection": "resumes",
  "sampleResumeStored": true,
  "structuredMetadataAvailable": true,
  "resumeEmbeddingAvailable": true,
  "embeddingModel": "mistral-embed",
  "embeddingDimension": 1024
}
```

If any field above is false, remain in the ingestion phase.

---

# 9. Final Ingestion Pipeline

```text
Resume PDF
    ↓
Upload + Validation
    ↓
PDF Text Extraction
    ↓
Text Cleaning
    ↓
Regex + Algorithm Parsing
    ↓
Optional LLM Parsing
    ↓
Structured Resume JSON
    ↓
Mistral Resume Embedding
    ↓
MongoDB `resumes`
    ↓
Verify Data + Embedding
    ↓
INGESTION COMPLETE
```

---

# 10. Next Step

After all ingestion checkpoints pass, continue with:

```text
02_Resume_Retrieval_Phasewise_Implementation.md
```

That document must reuse this same project, MongoDB connection, `resumes` collection, stored metadata, and stored resume embeddings. Do not create a second backend server or a second codebase.
