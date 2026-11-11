import "dotenv/config";
import assert from "node:assert/strict";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Server } from "node:http";
import { MongoClient, ObjectId } from "mongodb";
import { closeDatabaseConnection } from "../src/config/database";
import { env } from "../src/config/env";
import { after, before, test } from "node:test";

const dimension = Number(process.env.EMBEDDING_DIMENSION ?? 1024);
const databaseConfigured = Boolean(
  process.env.MONGODB_URI &&
  process.env.MONGODB_URI !== "YOUR_MONGODB_CONNECTION_STRING",
);
const originalFetch = globalThis.fetch.bind(globalThis);
const embeddingInputs: string[] = [];
const storedResumeIds: string[] = [];
const uploadsDirectory = path.resolve(process.cwd(), "uploads");

process.env.MISTRAL_API_KEY = "phase16-integration-test-key";
process.env.MISTRAL_EMBED_MODEL = "mistral-embed";
process.env.EMBEDDING_DIMENSION = String(dimension);
process.env.USE_LLM_PARSER = "false";

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === "https://api.mistral.ai/v1/embeddings") {
    const body = JSON.parse(String(init?.body)) as { input: string };
    embeddingInputs.push(body.input);
    if (body.input.includes("phase16-trigger-embedding-failure")) {
      return new Response("{}", { status: 503 });
    }
    return Response.json({
      data: [
        {
          embedding: Array.from(
            { length: dimension },
            (_, index) => index / dimension,
          ),
        },
      ],
    });
  }
  if (url === "https://api.groq.com/openai/v1/chat/completions") {
    const request = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = request.messages.findLast(
      (message) => message.role === "user",
    );
    const input = JSON.parse(userMessage?.content ?? "{}") as {
      candidates?: Array<{ resumeId: string }>;
      candidate?: { resumeId: string };
    };
    if (input.candidate) {
      return Response.json({
        choices: [
          {
            message: {
              content:
                "Relevant experience based on the supplied candidate details.",
            },
          },
        ],
      });
    }
    if (
      request.messages[0]?.content.includes("Summarize each supplied candidate")
    ) {
      const results = (input.candidates ?? [])
        .map(
          (candidate) =>
            `${candidate.resumeId}\tRelevant experience based on the supplied candidate details.`,
        )
        .join("\n");
      return Response.json({
        choices: [{ message: { content: results } }],
      });
    }
    const results = (input.candidates ?? [])
      .map((candidate) => candidate.resumeId)
      .join("\n");
    return Response.json({
      choices: [{ message: { content: results } }],
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;

const { default: app } = require("../src/app") as {
  default: import("express").Express;
};
let server: Server;
let baseUrl: string;
let mongoClient: MongoClient | undefined;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Unable to start integration server");
  baseUrl = `http://127.0.0.1:${address.port}`;
  if (databaseConfigured) {
    mongoClient = new MongoClient(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 8000,
    });
    await mongoClient.connect();
  }
});

after(async () => {
  if (mongoClient && storedResumeIds.length > 0) {
    await mongoClient
      .db(process.env.MONGODB_DB_NAME ?? "resume_rag")
      .collection("resumes")
      .deleteMany({
        _id: { $in: storedResumeIds.map((id) => new ObjectId(id)) },
      });
  }
  await mongoClient?.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeDatabaseConnection();
  globalThis.fetch = originalFetch;
});

test("GET /v1/health returns healthy response and request ID", async () => {
  const response = await fetch(`${baseUrl}/v1/health`);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
});

test(
  "GET /v1/health/db reports the configured MongoDB connection",
  { skip: !databaseConfigured },
  async () => {
    const response = await fetch(`${baseUrl}/v1/health/db`);
    const body = (await response.json()) as {
      status: string;
      database: string;
      connected: boolean;
    };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.database, "mongodb");
    assert.equal(body.connected, true);
  },
);

test(
  "GET /v1/search/readiness verifies stored resume embeddings",
  { skip: !databaseConfigured },
  async () => {
    const response = await fetch(`${baseUrl}/v1/search/readiness`);
    const body = (await response.json()) as {
      ready: boolean;
      collection: string;
      resumeCount: number;
      resumesWithEmbedding: number;
      embeddingDimension: number;
    };

    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(body.collection, "resumes");
    assert.ok(body.resumeCount > 0);
    assert.ok(body.resumesWithEmbedding > 0);
    assert.equal(body.embeddingDimension, dimension);
  },
);

test("upload rejects invalid file and missing file with stable errors", async () => {
  const missing = await fetch(`${baseUrl}/v1/resume/upload`, {
    method: "POST",
  });
  const missingBody = (await missing.json()) as {
    errorCode: string;
    requestId: string;
  };
  assert.equal(missing.status, 400);
  assert.equal(missingBody.errorCode, "FILE_REQUIRED");
  assert.equal(missingBody.requestId, missing.headers.get("x-request-id"));

  const form = new FormData();
  form.set(
    "file",
    new File(["not a PDF"], "invalid.txt", { type: "text/plain" }),
  );
  const invalid = await fetch(`${baseUrl}/v1/resume/upload`, {
    method: "POST",
    body: form,
  });
  const invalidBody = (await invalid.json()) as { errorCode: string };
  assert.equal(invalid.status, 415);
  assert.equal(invalidBody.errorCode, "INVALID_FILE_TYPE");
});

test("upload rejects payloads larger than configured limit", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    }),
  );
  const response = await fetch(`${baseUrl}/v1/resume/upload`, {
    method: "POST",
    body: form,
  });
  const body = (await response.json()) as { errorCode: string };
  assert.equal(response.status, 413);
  assert.equal(body.errorCode, "FILE_TOO_LARGE");
});

test("JSON endpoints return 413 for bodies above the configured request limit", async () => {
  const response = await postJson("/v1/search", {
    query: "x".repeat(env.maxJsonBodySizeBytes + 100),
  });
  const body = (await response.json()) as {
    success: boolean;
    errorCode: string;
    requestId: string;
  };

  assert.equal(response.status, 413);
  assert.equal(body.success, false);
  assert.equal(body.errorCode, "REQUEST_TOO_LARGE");
  assert.equal(body.requestId, response.headers.get("x-request-id"));
});

test("extract endpoint reads PDF text and removes its temporary upload", async () => {
  const beforeFiles = new Set(await readdir(uploadsDirectory));
  const form = new FormData();
  form.set(
    "file",
    new File(
      [makePdf(["QA Engineer", "Selenium WebDriver"])],
      "extract-test.pdf",
      { type: "application/pdf" },
    ),
  );
  const response = await fetch(`${baseUrl}/v1/resume/extract`, {
    method: "POST",
    body: form,
  });
  const body = (await response.json()) as {
    success: boolean;
    rawText: string;
    characters: number;
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.rawText, /QA Engineer/);
  assert.equal(body.characters, body.rawText.length);
  const leftovers = (await readdir(uploadsDirectory)).filter(
    (file) => !beforeFiles.has(file),
  );
  assert.deepEqual(leftovers, []);
});

test("parse endpoint returns deterministic structured resume", async () => {
  const response = await postJson("/v1/resume/parse", {
    rawText:
      "Name: Phase Sixteen Candidate\nEmail: phase16@example.com\nRole: QA Engineer\nPython RAG",
  });
  const body = (await response.json()) as {
    success: boolean;
    resume: { name: string; email: string; skills: string[] };
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.resume.name, "Phase Sixteen Candidate");
  assert.equal(body.resume.email, "phase16@example.com");
  assert.ok(body.resume.skills.includes("Python"));
});

test("embed endpoint returns a numeric vector with configured dimension", async () => {
  const response = await postJson("/v1/resume/embed", {
    name: "Phase Sixteen Candidate",
    role: "QA Engineer",
    skills: ["Python", "RAG"],
    company: "Integration Test Co",
    rawText: "Safe mocked embedding integration input",
  });
  const body = (await response.json()) as {
    success: boolean;
    model: string;
    dimension: number;
    embedding: number[];
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.model, "mistral-embed");
  assert.equal(body.dimension, dimension);
  assert.equal(body.embedding.length, dimension);
  assert.ok(body.embedding.every(Number.isFinite));
  assert.ok(
    embeddingInputs.at(-1)?.includes("Safe mocked embedding integration input"),
  );
});

test("query embeddings endpoint returns a numeric vector without altering the query", async () => {
  const query =
    "senior agentic QA architect with RAG, DeepEval and MCP experience";
  const response = await postJson("/v1/embeddings", {
    model: "mistral-embed",
    input: query,
  });
  const body = (await response.json()) as {
    embedding: number[];
    model: string;
    dimension: number;
  };

  assert.equal(response.status, 200);
  assert.equal(body.model, "mistral-embed");
  assert.equal(body.dimension, dimension);
  assert.equal(body.embedding.length, dimension);
  assert.ok(body.embedding.every(Number.isFinite));
  assert.equal(embeddingInputs.at(-1), query);
});

test("vector search endpoint queries Atlas with an on-demand query embedding", async () => {
  const response = await postJson("/v1/search/vector", {
    query: "senior engineer who has built safe RAG and LLM evaluation systems",
    topK: 3,
    exactRescore: true,
  });
  const body = (await response.json()) as {
    mode: string;
    count: number;
    results: Array<{ resumeId: string; vectorScore: number }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.mode, "vector");
  assert.ok(body.count > 0);
  assert.ok(body.count <= 3);
  assert.ok(
    body.results.every(
      (result) =>
        typeof result.resumeId === "string" &&
        Number.isFinite(result.vectorScore),
    ),
  );
  assert.ok(
    embeddingInputs
      .at(-1)
      ?.includes(
        "senior engineer who has built safe RAG and LLM evaluation systems",
      ),
  );
});

test("BM25 search endpoint returns ranked matches from Atlas Search", async () => {
  const response = await postJson("/v1/search/bm25", {
    query: "agentic QA architect RAG MCP DeepEval",
    topK: 5,
  });
  const body = (await response.json()) as {
    mode: string;
    query: string;
    count: number;
    results: Array<{
      resumeId: string;
      score: number;
      matchedSkills: string[];
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.mode, "bm25");
  assert.equal(body.query, "agentic QA architect RAG MCP DeepEval");
  assert.ok(body.count > 0);
  assert.ok(body.count <= 5);
  assert.ok(
    body.results.every(
      (result) =>
        typeof result.resumeId === "string" && Number.isFinite(result.score),
    ),
  );
});

test("hybrid search endpoint returns independent ranked lists and timings", async () => {
  const query = "agentic QA architect with RAG evaluation";
  const response = await postJson("/v1/search/hybrid", { query, topK: 5 });
  const body = (await response.json()) as {
    mode: string;
    bm25: Array<{ resumeId: string; score: number }>;
    vector: Array<{ resumeId: string; score: number }>;
    timings: { bm25Ms: number; embeddingMs: number; vectorMs: number };
  };

  assert.equal(response.status, 200);
  assert.equal(body.mode, "hybrid-debug");
  assert.ok(body.bm25.length > 0);
  assert.ok(body.vector.length > 0);
  assert.ok(body.bm25.every((result) => Number.isFinite(result.score)));
  assert.ok(body.vector.every((result) => Number.isFinite(result.score)));
  assert.ok(Number.isFinite(body.timings.bm25Ms));
  assert.ok(Number.isFinite(body.timings.embeddingMs));
  assert.ok(Number.isFinite(body.timings.vectorMs));
  assert.ok(embeddingInputs.at(-1)?.includes(query));
});

test("rerank endpoint returns ranks only for supplied candidate IDs", async () => {
  const response = await postJson("/v1/search/rerank", {
    query: "Need a senior QA architect with RAG evaluation experience",
    candidates: [
      {
        resumeId: "691db80aa895776f97b6eca6",
        snippet:
          "Test Architect with RAG, DeepEval and MCP evaluation experience.",
      },
    ],
    topK: 10,
  });
  const body = (await response.json()) as {
    model: string;
    results: Array<{
      resumeId: string;
      rank: number;
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(
    body.model,
    process.env.GROQ_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
  );
  assert.deepEqual(body.results, [
    { resumeId: "691db80aa895776f97b6eca6", rank: 1 },
  ]);
});

test("summarize endpoint returns the supplied candidate ID and grounded summary", async () => {
  const response = await postJson("/v1/search/summarize", {
    query: "Senior QA architect with GenAI RAG and evaluation experience",
    candidate: {
      resumeId: "691db80aa895776f97b6eca6",
      snippet: "13+ years with RAG, DeepEval, MCP and Agentic QA systems.",
    },
    style: "short",
    maxTokens: 150,
  });
  const body = (await response.json()) as { resumeId: string; summary: string };

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    resumeId: "691db80aa895776f97b6eca6",
    summary: "Relevant experience based on the supplied candidate details.",
  });
});

test("final search endpoint runs Atlas retrieval and returns ranked candidate results", async () => {
  const response = await postJson("/v1/search", {
    query: "agentic QA architect with RAG evaluation",
    options: {
      bm25TopK: 5,
      vectorTopK: 5,
      rerankTopN: 5,
      finalTopK: 3,
      exactVectorRescore: true,
    },
  });
  const body = (await response.json()) as {
    query: string;
    results: Array<{ resumeId: string; rank: number; sources: string[] }>;
    degraded: boolean;
    warnings: string[];
    timings: Record<string, number>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.query, "agentic QA architect with RAG evaluation");
  assert.ok(body.results.length > 0);
  assert.ok(body.results.length <= 3);
  assert.equal(body.results[0]?.rank, 1);
  assert.ok(
    body.results.every(
      (result) =>
        typeof result.resumeId === "string" && result.sources.length > 0,
    ),
  );
  assert.equal(body.degraded, false);
  assert.deepEqual(body.warnings, []);
  assert.ok(Object.values(body.timings).every(Number.isFinite));
});

test("end-to-end search finds the ingested Rajesh sample with a valid rank and summary", async () => {
  const response = await postJson("/v1/search", {
    query: "Senior QA architect with RAG, DeepEval and MCP experience",
    options: {
      bm25TopK: 20,
      vectorTopK: 20,
      rerankTopN: 10,
      finalTopK: 5,
      summarize: true,
      summaryStyle: "short",
    },
  });
  const body = (await response.json()) as {
    results: Array<{
      rank: number;
      resumeId: string;
      name?: string;
      sources: string[];
      summary?: string;
    }>;
  };

  assert.equal(response.status, 200);
  assert.ok(body.results.length > 0);
  const sample = body.results.find(
    (candidate) => candidate.name === "Rajesh Mohan Kumar",
  );
  assert.ok(sample, "expected the ingested Rajesh sample to be returned");
  assert.ok(
    Number.isInteger(sample.rank) &&
      sample.rank >= 1 &&
      sample.rank <= body.results.length,
  );
  assert.ok(
    sample.sources.includes("bm25") || sample.sources.includes("vector"),
  );
  assert.ok(sample.summary?.trim());
});

test(
  "store endpoint persists and returns a verifiable MongoDB record",
  { skip: !databaseConfigured },
  async () => {
    const rawText = `Phase 16 store integration ${Date.now()}`;
    const response = await postJson("/v1/resume/store", {
      fileName: "phase16-store-test.pdf",
      resume: { name: "Phase Sixteen Store Test", skills: ["RAG"] },
      rawText,
      embedding: Array(dimension).fill(0.125),
    });
    const body = (await response.json()) as { resumeId: string };
    assert.equal(response.status, 201);
    storedResumeIds.push(body.resumeId);
    const stored = await mongoClient!
      .db(process.env.MONGODB_DB_NAME ?? "resume_rag")
      .collection("resumes")
      .findOne({ _id: new ObjectId(body.resumeId) });
    assert.ok(stored);
    assert.equal(stored.rawText, rawText);
    assert.equal(stored.embedding.length, dimension);
    assert.deepEqual(stored.skills, ["RAG"]);
  },
);

test(
  "full ingest stores a PDF-derived resume using mocked Mistral",
  { skip: !databaseConfigured },
  async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [
          makePdf([
            "Name: Phase Sixteen Ingest Test",
            "Email: phase16-ingest@example.com",
            "Role: QA Engineer",
            "Company: Integration Test Co",
            "2 years of experience",
            "Python Selenium RAG",
          ]),
        ],
        "phase16-ingest-test.pdf",
        { type: "application/pdf" },
      ),
    );
    const response = await fetch(`${baseUrl}/v1/resume/ingest`, {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as {
      resumeId: string;
      data: { name: string; embeddingDimension: number };
      timings: Record<string, number>;
    };
    assert.equal(response.status, 200);
    storedResumeIds.push(body.resumeId);
    assert.equal(body.data.name, "Phase Sixteen Ingest Test");
    assert.equal(body.data.embeddingDimension, dimension);
    assert.ok(Object.values(body.timings).every(Number.isFinite));
    assert.ok(embeddingInputs.at(-1)?.includes("Phase Sixteen Ingest Test"));
    const stored = await mongoClient!
      .db(process.env.MONGODB_DB_NAME ?? "resume_rag")
      .collection("resumes")
      .findOne({ _id: new ObjectId(body.resumeId) });
    assert.ok(stored);
    assert.equal(stored.embedding.length, dimension);
  },
);

test("ingest maps Mistral failures to the stable embedding error", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(
      [makePdf(["Name: phase16-trigger-embedding-failure", "Python"])],
      "phase16-failure.pdf",
      { type: "application/pdf" },
    ),
  );
  const response = await fetch(`${baseUrl}/v1/resume/ingest`, {
    method: "POST",
    body: form,
  });
  const body = (await response.json()) as {
    errorCode: string;
    requestId: string;
  };
  assert.equal(response.status, 502);
  assert.equal(body.errorCode, "EMBEDDING_FAILED");
  assert.equal(body.requestId, response.headers.get("x-request-id"));
});

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePdf(lines: string[]): Buffer {
  const newline = "\n";
  const escape = (text: string) =>
    text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const commands = [
    "BT /F1 10 Tf 72 720 Td (" + escape(lines[0] ?? "") + ") Tj",
    ...lines.slice(1).map((line) => "0 -16 Td (" + escape(line) + ") Tj"),
    "ET",
  ].join(newline);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " +
      Buffer.byteLength(commands) +
      " >>" +
      newline +
      "stream" +
      newline +
      commands +
      newline +
      "endstream",
  ];
  let pdf = "%PDF-1.4" + newline;
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf +=
      index +
      1 +
      " 0 obj" +
      newline +
      objects[index] +
      newline +
      "endobj" +
      newline;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref" + newline + "0 6" + newline + "0000000000 65535 f " + newline;
  for (const offset of offsets.slice(1))
    pdf += String(offset).padStart(10, "0") + " 00000 n " + newline;
  pdf +=
    "trailer" +
    newline +
    "<< /Size 6 /Root 1 0 R >>" +
    newline +
    "startxref" +
    newline +
    xref +
    newline +
    "%%EOF" +
    newline;
  return Buffer.from(pdf, "ascii");
}
