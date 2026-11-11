import assert from "node:assert/strict";
import test from "node:test";
import { Collection, Db, Document, ObjectId } from "mongodb";
import { Request, Response } from "express";
import { env } from "../src/config/env";
import { RetrievalController } from "../src/modules/retrieval/controllers/retrievalController";
import { MongoResumeRepository } from "../src/modules/retrieval/repositories/ResumeRepository";
import { MongoSearchService } from "../src/modules/retrieval/services/SearchService";
import { Bm25ResumeHit } from "../src/modules/retrieval/types/retrieval.types";

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

const hit: Bm25ResumeHit = {
	_id: new ObjectId("691db80aa895776f97b6eca6"),
	name: "Test Candidate",
	role: "QA Architect",
	company: "Example Co",
	totalExperience: 13,
	skills: ["RAG", "DeepEval", "MCP (Model Context Protocol)"],
	bm25Score: 8.41,
};

test("BM25 repository searches mapped fields, applies experience filters and limits results", async () => {
	let pipeline: Document[] = [];
	const collection = {
		aggregate<T>(_pipeline: Document[]) {
			pipeline = _pipeline;
			return { toArray: async () => [hit] as T[] };
		},
	} as unknown as Collection<Bm25ResumeHit>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	assert.deepEqual(await repository.searchBm25("RAG architect", { minYearsExperience: 10 }, 7), [hit]);
	const search = pipeline[0]?.$search as { index: string; compound: { must: Array<{ text: { path: string[] } }>; filter: Array<{ range: { path: string; gte: number } }> } };
	assert.equal(search.index, env.mongodbBm25SearchIndex);
	assert.deepEqual(search.compound.must[0]?.text.path, ["rawText", "skills", "jobTitles", "experienceSummary", "role", "company"]);
	assert.deepEqual(search.compound.filter[0]?.range, { path: "totalExperience", gte: 10 });
	assert.deepEqual(pipeline[1], { $limit: 7 });
	assert.deepEqual(pipeline[2]?.$project, {
		_id: 1,
		name: 1,
		role: 1,
		company: 1,
		totalExperience: 1,
		skills: 1,
		snippet: { $substrCP: ["$rawText", 0, 1200] },
		bm25Score: { $meta: "searchScore" },
	});
});

test("BM25 service maps Atlas hits into normalized candidates with matched skills", async () => {
	const service = new MongoSearchService({ searchBm25: async () => [hit], searchVector: async () => [] });
	const results = await service.bm25Search("QA architect with RAG and DeepEval", {}, 20);

	assert.deepEqual(results, [{
		resumeId: "691db80aa895776f97b6eca6",
		name: "Test Candidate",
		role: "QA Architect",
		company: "Example Co",
		totalExperience: 13,
		skills: ["RAG", "DeepEval", "MCP (Model Context Protocol)"],
		matchedSkills: ["RAG", "DeepEval"],
		bm25Score: 8.41,
		sources: ["bm25"],
	}]);
});

test("BM25 controller returns ranked results and defaults topK", async () => {
	let received: { query: string; topK: number } | undefined;
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async (query, _filters, topK) => {
			received = { query, topK };
			return [{
				resumeId: "691db80aa895776f97b6eca6",
				name: "Test Candidate",
				role: "QA Architect",
				bm25Score: 8.41,
				matchedSkills: ["RAG"],
				sources: ["bm25"],
			}];
		} },
	);
	const response = createResponse();

	await controller.bm25Search({ body: { query: " RAG architect ", filters: { minYearsExperience: 10 } } } as Request, response as unknown as Response);

	assert.deepEqual(received, { query: "RAG architect", topK: 20 });
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		mode: "bm25",
		query: "RAG architect",
		count: 1,
		results: [{
			resumeId: "691db80aa895776f97b6eca6",
			name: "Test Candidate",
			role: "QA Architect",
			score: 8.41,
			matchedSkills: ["RAG"],
		}],
	});
});

test("BM25 controller rejects invalid query, topK, and filter values", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => { throw new Error("Search must not run for invalid input"); } },
	);
	for (const body of [
		{ query: " " },
		{ query: "valid", topK: 101 },
		{ query: "valid", filters: null },
		{ query: "valid", filters: { minYearsExperience: -1 } },
	]) {
		const response = createResponse();
		await controller.bm25Search({ body } as Request, response as unknown as Response);
		assert.equal(response.statusCode, 400);
		assert.equal((response.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");
	}
});

test("BM25 controller maps Atlas search failures to a stable service response", async () => {
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [] },
		{ bm25Search: async () => { throw new Error("Search index is unavailable"); } },
	);
	const response = createResponse();

	await controller.bm25Search({ body: { query: "RAG" } } as Request, response as unknown as Response);

	assert.equal(response.statusCode, 503);
	assert.equal((response.body as { errorCode: string }).errorCode, "SEARCH_FAILED");
});