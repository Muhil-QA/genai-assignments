import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { Request, Response } from "express";
import { RetrievalController } from "../src/modules/retrieval/controllers/retrievalController";
import { MongoSearchService } from "../src/modules/retrieval/services/SearchService";

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

test("hybrid search starts BM25 and query embedding independently and preserves scores", async () => {
	let bm25Started = false;
	let embeddingStarted = false;
	let vectorStarted = false;
	const service = new MongoSearchService({
		searchBm25: async () => {
			bm25Started = true;
			return [{
				_id: new ObjectId("691db80aa895776f97b6eca6"),
				name: "Candidate",
				skills: [],
				bm25Score: 8.41,
			}];
		},
		searchVector: async () => {
			vectorStarted = true;
			return [{
				_id: { toHexString: () => "resume-1" } as never,
				name: "Candidate",
				vectorScore: 0.88,
			}];
		},
	}, {
		generateQueryEmbedding: async () => {
			embeddingStarted = true;
			assert.equal(bm25Started, true);
			return [0.1, 0.2];
		},
	});

	const result = await service.hybridSearch("RAG QA architect", {}, 10);

	assert.equal(embeddingStarted, true);
	assert.equal(vectorStarted, true);
	assert.equal(result.bm25[0]?.bm25Score, 8.41);
	assert.equal(result.vector[0]?.vectorScore, 0.88);
	assert.ok(Number.isFinite(result.timings.bm25Ms));
	assert.ok(Number.isFinite(result.timings.embeddingMs));
	assert.ok(Number.isFinite(result.timings.vectorMs));
});

test("hybrid controller returns separate debug lists and component timings", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => ({
			bm25: [{ resumeId: "resume-1", name: "Candidate", bm25Score: 8.41, sources: ["bm25"] }],
			vector: [{ resumeId: "resume-1", name: "Candidate", vectorScore: 0.88, sources: ["vector"] }],
			timings: { bm25Ms: 80, embeddingMs: 150, vectorMs: 70 },
		}) },
	);
	const response = createResponse();

	await controller.hybridSearch({ body: { query: "RAG QA architect", topK: 10 } } as Request, response as unknown as Response);

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		mode: "hybrid-debug",
		bm25: [{ resumeId: "resume-1", name: "Candidate", score: 8.41 }],
		vector: [{ resumeId: "resume-1", name: "Candidate", score: 0.88 }],
		timings: { bm25Ms: 80, embeddingMs: 150, vectorMs: 70 },
	});
});

test("hybrid controller rejects invalid requests and maps component failures", async () => {
	const invalidController = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => { throw new Error("Must not search invalid input"); } },
	);
	const invalidResponse = createResponse();
	await invalidController.hybridSearch({ body: { query: "", topK: 10 } } as Request, invalidResponse as unknown as Response);
	assert.equal(invalidResponse.statusCode, 400);
	assert.equal((invalidResponse.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");

	const failureController = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
		{ hybridSearch: async () => { throw new Error("A component failed"); } },
	);
	const failureResponse = createResponse();
	await failureController.hybridSearch({ body: { query: "valid query" } } as Request, failureResponse as unknown as Response);
	assert.equal(failureResponse.statusCode, 503);
	assert.equal((failureResponse.body as { errorCode: string }).errorCode, "SEARCH_FAILED");
});