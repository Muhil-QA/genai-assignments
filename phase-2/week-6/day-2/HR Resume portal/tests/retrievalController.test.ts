import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { env } from "../src/config/env";
import { CandidateController } from "../src/modules/retrieval/controllers/candidateController";
import { RetrievalController } from "../src/modules/retrieval/controllers/retrievalController";
import { ResumeProfileDocument } from "../src/modules/retrieval/repositories/ResumeRepository";

function createResponse() {
	const response = {
		locals: {},
		statusCode: 0,
		body: undefined as unknown,
		status(statusCode: number) {
			this.statusCode = statusCode;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	};
	return response;
}

test("readiness controller returns the validation result", async () => {
	const readiness = { ready: true as const, collection: "resumes", resumeCount: 1, resumesWithEmbedding: 1, embeddingModel: "mistral-embed", embeddingDimension: 1024 };
	const controller = new RetrievalController({ getReadiness: async () => readiness });
	const response = createResponse();

	await controller.getReadiness({} as Request, response as unknown as Response);

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, readiness);
});

test("readiness controller maps validation failures to the existing 503 response", async () => {
	const controller = new RetrievalController({ getReadiness: async () => { throw new Error("database unavailable"); } });
	const response = createResponse();

	await controller.getReadiness({} as Request, response as unknown as Response);

	assert.equal(response.statusCode, 503);
	assert.deepEqual(response.body, {
		ready: false,
		reason: "Unable to verify resume readiness from MongoDB",
	});

	test("candidate controller returns only the supported profile fields", async () => {
		const candidateId = "691db80aa895776f97b6eca6";
		const candidate = {
			_id: new ObjectId(candidateId),
			name: "Test Candidate",
			email: "candidate@example.com",
			phone: "+1 555 0100",
			location: "Remote",
			role: "QA Engineer",
			company: "Example Co",
			education: "BSc Computer Science",
			totalExperience: 5,
			relevantExperience: 3,
			skills: ["Testing"],
			jobTitles: ["QA Engineer"],
			experienceSummary: "Five years in quality engineering.",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
		} satisfies ResumeProfileDocument;
		let receivedId = "";
		const controller = new CandidateController({
			findProfileById: async (id) => {
				receivedId = id;
				return candidate;
			},
		});
		const response = createResponse();

		await controller.getCandidate({
			params: { id: candidateId },
		} as unknown as Request, response as unknown as Response);

		assert.equal(receivedId, candidateId);
		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.body, {
			_id: candidateId,
			name: "Test Candidate",
			email: "candidate@example.com",
			phone: "+1 555 0100",
			location: "Remote",
			role: "QA Engineer",
			company: "Example Co",
			education: "BSc Computer Science",
			totalExperience: 5,
			relevantExperience: 3,
			skills: ["Testing"],
			jobTitles: ["QA Engineer"],
			experienceSummary: "Five years in quality engineering.",
			processedAt: candidate.createdAt,
		});
	});

	test("candidate controller returns 404 for missing profiles", async () => {
		const controller = new CandidateController({ findProfileById: async () => null });
		const response = createResponse();

		await controller.getCandidate({
			params: { id: "not-an-object-id" },
		} as unknown as Request, response as unknown as Response);

		assert.equal(response.statusCode, 404);
		assert.equal((response.body as { errorCode: string }).errorCode, "CANDIDATE_NOT_FOUND");
	});

	test("candidate controller reports repository failures", async () => {
		const controller = new CandidateController({
			findProfileById: async () => { throw new Error("database unavailable"); },
		});
		const response = createResponse();

		await controller.getCandidate({
			params: { id: "691db80aa895776f97b6eca6" },
		} as unknown as Request, response as unknown as Response);

		assert.equal(response.statusCode, 503);
		assert.equal((response.body as { errorCode: string }).errorCode, "CANDIDATE_LOOKUP_FAILED");
	});
});

test("query embedding controller returns vector metadata", async () => {
	let embeddedQuery = "";
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async (query) => { embeddedQuery = query; return [0.12, -0.04, 0.08]; } },
	);
	const response = createResponse();
	const query = "senior agentic QA architect with RAG, DeepEval and MCP experience";

	await controller.createQueryEmbedding({
		body: { model: env.mistralEmbedModel, input: query },
	} as Request, response as unknown as Response);

	assert.equal(embeddedQuery, query);
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		embedding: [0.12, -0.04, 0.08],
		model: env.mistralEmbedModel,
		dimension: 3,
	});
});

test("query embedding controller rejects empty queries and unsupported models", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => { throw new Error("Must not generate an embedding"); } },
	);
	for (const body of [
		{ model: env.mistralEmbedModel, input: "  " },
		{ model: "unsupported-model", input: "valid query" },
	]) {
		const response = createResponse();
		await controller.createQueryEmbedding({ body } as Request, response as unknown as Response);
		assert.equal(response.statusCode, 400);
		assert.equal((response.body as { errorCode: string }).errorCode, "INVALID_REQUEST");
	}
});

test("query embedding controller maps provider errors to EMBEDDING_FAILED", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => { throw new Error("provider unavailable"); } },
	);
	const response = createResponse();

	await controller.createQueryEmbedding({
		body: { model: env.mistralEmbedModel, input: "valid query" },
	} as Request, response as unknown as Response);

	assert.equal(response.statusCode, 502);
	assert.equal((response.body as { errorCode: string }).errorCode, "EMBEDDING_FAILED");
});

test("rerank endpoint controller returns validated results and configured model", async () => {
	let received: { query: string; candidates: Array<{ resumeId: string; snippet?: string }>; topK: number } | undefined;
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async (query, candidates, topK) => {
			received = { query, candidates, topK };
			return [{ resumeId: "691db80aa895776f97b6eca6", rank: 1, relevanceScore: 0.96, reason: "Direct RAG evaluation evidence." }];
		} },
	);
	const response = createResponse();
	const query = "Need a senior QA architect with RAG experience";

	await controller.rerankCandidates({ body: {
		query,
		candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: "RAG evaluation experience." }],
	} } as Request, response as unknown as Response);

	assert.deepEqual(received, {
		query,
		candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: "RAG evaluation experience.", sources: [] }],
		topK: 10,
	});
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		results: [{ resumeId: "691db80aa895776f97b6eca6", rank: 1, relevanceScore: 0.96, reason: "Direct RAG evaluation evidence." }],
		model: env.groqModel,
	});
});

test("rerank endpoint controller rejects invalid candidate payloads", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => { throw new Error("Must not rerank invalid payload"); } },
	);
	for (const body of [
		{ query: " ", candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: "text" }] },
		{ query: "valid query", candidates: [] },
		{ query: "valid query", candidates: [{ resumeId: "not-an-object-id", snippet: "text" }] },
		{ query: "valid query", candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: " " }] },
		{ query: "valid query", candidates: [{ resumeId: "691db80aa895776f97b6eca6" }] },
		{ query: "valid query", candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: "text" }], topK: 21 },
	]) {
		const response = createResponse();
		await controller.rerankCandidates({ body } as Request, response as unknown as Response);
		assert.equal(response.statusCode, 400);
		assert.equal((response.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");
	}
});

test("rerank endpoint controller maps Groq failures to RERANK_FAILED", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => { throw new Error("Groq returned invalid JSON"); } },
	);
	const response = createResponse();
	await controller.rerankCandidates({ body: {
		query: "valid query",
		candidates: [{ resumeId: "691db80aa895776f97b6eca6", snippet: "text" }],
	} } as Request, response as unknown as Response);

	assert.equal(response.statusCode, 502);
	assert.equal((response.body as { errorCode: string }).errorCode, "RERANK_FAILED");
});

test("summarize endpoint returns a candidate-grounded summary", async () => {
	let received: { query: string; candidate: { resumeId: string; snippet?: string }; options: { style: string; maxTokens: number } } | undefined;
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async (query, candidate, options) => {
			received = { query, candidate, options };
			return "Strong fit based on the supplied RAG evaluation experience.";
		} },
	);
	const response = createResponse();
	const query = "Senior QA architect with RAG evaluation experience";

	await controller.summarizeCandidate({ body: {
		query,
		candidate: { resumeId: "691db80aa895776f97b6eca6", snippet: "RAG evaluation experience." },
	} } as Request, response as unknown as Response);

	assert.deepEqual(received, {
		query,
		candidate: { resumeId: "691db80aa895776f97b6eca6", snippet: "RAG evaluation experience.", sources: [] },
		options: { style: "short", maxTokens: 150 },
	});
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		resumeId: "691db80aa895776f97b6eca6",
		summary: "Strong fit based on the supplied RAG evaluation experience.",
	});
});

test("summarize endpoint validates query, candidate, style, and token limit", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => { throw new Error("Must not summarize invalid input"); } },
	);
	for (const body of [
		{ query: "", candidate: { resumeId: "id", snippet: "text" } },
		{ query: "valid", candidate: { resumeId: "id", snippet: "text" }, style: "unknown" },
		{ query: "valid", candidate: { resumeId: "id", snippet: "text" }, maxTokens: 0 },
		{ query: "valid", candidate: { resumeId: "id", snippet: " " } },
	]) {
		const response = createResponse();
		await controller.summarizeCandidate({ body } as Request, response as unknown as Response);
		assert.equal(response.statusCode, 400);
		assert.equal((response.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");
	}
});

test("summarize endpoint maps Groq failures to SUMMARY_FAILED", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => { throw new Error("Groq failed"); } },
	);
	const response = createResponse();
	await controller.summarizeCandidate({ body: {
		query: "valid query",
		candidate: { resumeId: "691db80aa895776f97b6eca6", snippet: "candidate details" },
	} } as Request, response as unknown as Response);

	assert.equal(response.statusCode, 502);
	assert.equal((response.body as { errorCode: string }).errorCode, "SUMMARY_FAILED");
});