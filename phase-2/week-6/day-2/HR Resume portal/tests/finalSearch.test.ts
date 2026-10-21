import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";
import { RetrievalController } from "../src/modules/retrieval/controllers/retrievalController";
import { SearchUnavailableError } from "../src/modules/retrieval/services/SearchService";

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

test("final search validates filters/options and maps the documented result shape", async () => {
	let received: { query: string; filters: { minYearsExperience?: number }; options?: Record<string, unknown> } | undefined;
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => "unused" },
		{ endToEndSearch: async (query, filters, options) => {
			received = { query, filters, options };
			return {
				query,
				results: [{
					resumeId: "candidate-1",
					rank: 1,
					relevanceScore: 0.96,
					reason: "Strong match.",
					name: "Candidate One",
					role: "QA Architect",
					company: "Example Co",
					totalExperience: 13,
					skills: ["RAG", "DeepEval"],
					sources: ["bm25", "vector"],
					summary: "Strong fit based on the supplied experience.",
				}],
				degraded: false,
				warnings: [],
				vectorFallback: true,
				timings: { embeddingMs: 10, bm25Ms: 8, vectorMs: 7, rerankMs: 40, summarizeMs: 20, totalMs: 85 },
			};
		} },
	);
	const response = createResponse();
	const query = "Senior agentic QA architect with RAG experience";
	const options = { bm25TopK: 15, vectorTopK: 12, rerankTopN: 8, finalTopK: 3, summarize: true, summaryStyle: "short" };

	await controller.search({ body: { query, filters: { minYearsExperience: 10 }, options } } as Request, response as unknown as Response);

	assert.deepEqual(received, { query, filters: { minYearsExperience: 10 }, options });
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		query,
		results: [{
			rank: 1,
			resumeId: "candidate-1",
			name: "Candidate One",
			role: "QA Architect",
			company: "Example Co",
			totalExperience: 13,
			skills: ["RAG", "DeepEval"],
			sources: ["bm25", "vector"],
			summary: "Strong fit based on the supplied experience.",
		}],
		degraded: false,
		warnings: [],
		vectorFallback: true,
		timings: { embeddingMs: 10, bm25Ms: 8, vectorMs: 7, rerankMs: 40, summarizeMs: 20, totalMs: 85 },
	});
	assert.deepEqual(response.locals.retrievalTimings, {
		embeddingMs: 10,
		bm25Ms: 8,
		vectorMs: 7,
		rerankMs: 40,
		summarizeMs: 20,
		totalMs: 85,
	});
});

test("final search rejects invalid query, filters, and options", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => "unused" },
		{ endToEndSearch: async () => { throw new Error("Must not execute an invalid search"); } },
	);
	for (const body of [
		{ query: " " },
		{ query: "valid", filters: { minYearsExperience: -1 } },
		{ query: "valid", options: { finalTopK: 0 } },
		{ query: "valid", options: { summarize: "yes" } },
		{ query: "valid", options: { summaryStyle: "unknown" } },
	]) {
		const response = createResponse();
		await controller.search({ body } as Request, response as unknown as Response);
		assert.equal(response.statusCode, 400);
		assert.equal((response.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");
	}
	const missingQueryResponse = createResponse();
	await controller.search({ body: { query: "  " } } as Request, missingQueryResponse as unknown as Response);
	assert.deepEqual(missingQueryResponse.body, {
		success: false,
		errorCode: "INVALID_SEARCH_QUERY",
		message: "Search query is required",
	});
});

test("final search maps service errors to SEARCH_FAILED", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => "unused" },
		{ endToEndSearch: async () => { throw new Error("Groq or retrieval failure"); } },
	);
	const response = createResponse();
	await controller.search({ body: { query: "valid query" } } as Request, response as unknown as Response);
	assert.equal(response.statusCode, 503);
	assert.equal((response.body as { errorCode: string }).errorCode, "SEARCH_FAILED");
});

test("final search maps total retrieval failure to SEARCH_UNAVAILABLE", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({ bm25: [], vector: [], timings: { bm25Ms: 0, embeddingMs: 0, vectorMs: 0 } }) },
		{ rerankCandidates: async () => [] },
		{ summarizeCandidateFit: async () => "unused" },
		{ endToEndSearch: async () => { throw new SearchUnavailableError(); } },
	);
	const response = createResponse();
	await controller.search({ body: { query: "valid query" } } as Request, response as unknown as Response);
	assert.equal(response.statusCode, 503);
	assert.deepEqual(response.body, {
		success: false,
		errorCode: "SEARCH_UNAVAILABLE",
		message: "No retrieval strategy is currently available",
	});
});