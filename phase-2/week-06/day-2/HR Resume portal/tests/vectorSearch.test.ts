import assert from "node:assert/strict";
import test from "node:test";
import { Collection, Db, Document, ObjectId } from "mongodb";
import { Request, Response } from "express";
import { env } from "../src/config/env";
import { RetrievalController } from "../src/modules/retrieval/controllers/retrievalController";
import { MongoResumeRepository } from "../src/modules/retrieval/repositories/ResumeRepository";
import { exactCosineScore, MongoSearchService } from "../src/modules/retrieval/services/SearchService";
import { VectorResumeHit } from "../src/modules/retrieval/types/retrieval.types";

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

const vectorHit: VectorResumeHit = {
	_id: new ObjectId("691db80aa895776f97b6eca6"),
	name: "Test Candidate",
	role: "QA Architect",
	company: "Example Co",
	skills: ["RAG", "DeepEval"],
	vectorScore: 0.88,
};

test("vector repository uses configured index, embedding path, dimension, and topK", async () => {
	let pipeline: Document[] = [];
	const collection = {
		aggregate<T>(_pipeline: Document[]) {
			pipeline = _pipeline;
			return { toArray: async () => [vectorHit] as T[] };
		},
	} as unknown as Collection<VectorResumeHit>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);
	const queryVector = Array(env.embeddingDimension).fill(0.25);

	assert.deepEqual(await repository.searchVector(queryVector, 5), [vectorHit]);
	assert.deepEqual(pipeline[0]?.$vectorSearch, {
		index: env.mongodbVectorSearchIndex,
		path: "embedding",
		queryVector,
		numCandidates: 100,
		limit: 5,
	});
	assert.deepEqual(pipeline[1]?.$project, {
		_id: 1,
		name: 1,
		role: 1,
		company: 1,
		totalExperience: 1,
		skills: 1,
		snippet: { $substrCP: ["$rawText", 0, 1200] },
		vectorScore: { $meta: "vectorSearchScore" },
	});
});

test("vector repository includes stored vectors only when exact rescoring is enabled", async () => {
	let pipeline: Document[] = [];
	const collection = {
		aggregate<T>(_pipeline: Document[]) {
			pipeline = _pipeline;
			return { toArray: async () => [vectorHit] as T[] };
		},
	} as unknown as Collection<VectorResumeHit>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	await repository.searchVector(Array(env.embeddingDimension).fill(0.25), 5, {}, true);

	assert.equal((pipeline.at(-1)?.$project as Record<string, unknown>).embedding, 1);
});

test("vector repository oversamples before applying experience filters", async () => {
	let pipeline: Document[] = [];
	const collection = {
		aggregate<T>(_pipeline: Document[]) {
			pipeline = _pipeline;
			return { toArray: async () => [vectorHit] as T[] };
		},
	} as unknown as Collection<VectorResumeHit>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	await repository.searchVector(Array(env.embeddingDimension).fill(0.25), 5, { minYearsExperience: 10 });

	assert.deepEqual(pipeline[0]?.$vectorSearch, {
		index: env.mongodbVectorSearchIndex,
		path: "embedding",
		queryVector: Array(env.embeddingDimension).fill(0.25),
		numCandidates: 1000,
		limit: 100,
	});
	assert.deepEqual(pipeline[1], { $match: { totalExperience: { $gte: 10 } } });
	assert.deepEqual(pipeline[2], { $limit: 5 });
});

test("vector repository rejects invalid query vectors before database access", async () => {
	let databaseAccessed = false;
	const repository = new MongoResumeRepository(async () => {
		databaseAccessed = true;
		throw new Error("Database must not be accessed for an invalid vector");
	});

	await assert.rejects(repository.searchVector([1, Number.NaN], 5), /configured vector dimension/);
	assert.equal(databaseAccessed, false);
});

test("vector service maps Atlas hits to vector-sourced candidates", async () => {
	const service = new MongoSearchService({
		searchBm25: async () => [],
		searchVector: async () => [vectorHit],
	});

	assert.deepEqual(await service.vectorSearchByEmbedding([0.1], {}, 10), [{
		resumeId: "691db80aa895776f97b6eca6",
		name: "Test Candidate",
		role: "QA Architect",
		company: "Example Co",
		skills: ["RAG", "DeepEval"],
		vectorScore: 0.88,
		sources: ["vector"],
	}]);
});

test("exact cosine rescoring reorders ANN candidates and normalizes Atlas scores", async () => {
	const queryVector = Array(env.embeddingDimension).fill(0);
	queryVector[0] = 1;
	const orthogonalVector = Array(env.embeddingDimension).fill(0);
	orthogonalVector[1] = 1;
	const alignedVector = Array(env.embeddingDimension).fill(0);
	alignedVector[0] = 1;
	const hits: VectorResumeHit[] = [
		{ ...vectorHit, _id: new ObjectId("000000000000000000000001"), name: "Atlas-first", vectorScore: 0.99, embedding: orthogonalVector },
		{ ...vectorHit, _id: new ObjectId("000000000000000000000002"), name: "Exact-first", vectorScore: 0.7, embedding: alignedVector },
	];
	let requestedExactRescore = false;
	const service = new MongoSearchService({
		searchBm25: async () => [],
		searchVector: async (_query, _topK, _filters, exactRescore) => {
			requestedExactRescore = exactRescore ?? false;
			return hits;
		},
	});

	const results = await service.vectorSearchByEmbedding(queryVector, {}, 2, true);

	assert.equal(requestedExactRescore, true);
	assert.equal(results[0]?.name, "Exact-first");
	assert.equal(results[0]?.vectorScore, 1);
	assert.equal(results[1]?.name, "Atlas-first");
	assert.equal(results[1]?.vectorScore, 0.5);
	assert.equal(exactCosineScore([0, 0], [1, 0]), undefined);
});

test("vector SearchService embeds a query once and returns normalized candidates", async () => {
	let embeddedQuery = "";
	let receivedVector: number[] = [];
	let receivedFilters: { minYearsExperience?: number } | undefined;
	const service = new MongoSearchService({
		searchBm25: async () => [],
		searchVector: async (queryVector, _topK, filters) => {
			receivedVector = queryVector;
			receivedFilters = filters;
			return [vectorHit];
		},
	}, {
		generateQueryEmbedding: async (query) => {
			embeddedQuery = query;
			return [0.1, 0.2];
		},
	});
	const query = "semantic retrieval for RAG evaluation";

	const candidates = await service.vectorSearch(query, { minYearsExperience: 8 }, 5);

	assert.equal(embeddedQuery, query);
	assert.deepEqual(receivedVector, [0.1, 0.2]);
	assert.deepEqual(receivedFilters, { minYearsExperience: 8 });
	assert.equal(candidates[0]?.resumeId, "691db80aa895776f97b6eca6");
	assert.deepEqual(candidates[0]?.sources, ["vector"]);
});

test("vector controller embeds the query and returns ranked results", async () => {
	let embeddedQuery = "";
	let searchedVector: number[] = [];
	let requestedExactRescore = false;
	const controller = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async (query) => { embeddedQuery = query; return [0.1, 0.2]; } },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async (queryVector, _filters, _topK, exactRescore) => {
			searchedVector = queryVector;
			requestedExactRescore = exactRescore ?? false;
			return [{ resumeId: "resume-1", name: "Test Candidate", role: "QA Architect", vectorScore: 0.88, sources: ["vector"] }];
		} },
	);
	const response = createResponse();
	const query = "senior engineer with RAG and LLM evaluation";

	await controller.vectorSearch({ body: { query, exactRescore: true } } as Request, response as unknown as Response);

	assert.equal(embeddedQuery, query);
	assert.deepEqual(searchedVector, [0.1, 0.2]);
	assert.equal(requestedExactRescore, true);
	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.body, {
		mode: "vector",
		count: 1,
		results: [{ resumeId: "resume-1", name: "Test Candidate", role: "QA Architect", vectorScore: 0.88 }],
	});
});

test("vector controller validates requests and maps embedding/search failures", async () => {
	const validationController = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => { throw new Error("Must not embed invalid input"); } },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
	);
	const invalidResponse = createResponse();
	await validationController.vectorSearch({ body: { query: " ", topK: 20 } } as Request, invalidResponse as unknown as Response);
	assert.equal(invalidResponse.statusCode, 400);
	assert.equal((invalidResponse.body as { errorCode: string }).errorCode, "INVALID_SEARCH_QUERY");
	const invalidOptionResponse = createResponse();
	await validationController.vectorSearch({ body: { query: "valid query", exactRescore: "yes" } } as Request, invalidOptionResponse as unknown as Response);
	assert.equal(invalidOptionResponse.statusCode, 400);

	const embeddingFailureController = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => { throw new Error("Mistral unavailable"); } },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => [] },
	);
	const embeddingResponse = createResponse();
	await embeddingFailureController.vectorSearch({ body: { query: "valid query" } } as Request, embeddingResponse as unknown as Response);
	assert.equal(embeddingResponse.statusCode, 502);
	assert.equal((embeddingResponse.body as { errorCode: string }).errorCode, "EMBEDDING_FAILED");

	const searchFailureController = new RetrievalController(
		{ getReadiness: async () => ({ ready: false, reason: "unused" }) },
		{ generateQueryEmbedding: async () => [0.1] },
		{ bm25Search: async () => [] },
		{ vectorSearchByEmbedding: async () => { throw new Error("Atlas unavailable"); } },
	);
	const searchResponse = createResponse();
	await searchFailureController.vectorSearch({ body: { query: "valid query" } } as Request, searchResponse as unknown as Response);
	assert.equal(searchResponse.statusCode, 503);
	assert.equal((searchResponse.body as { errorCode: string }).errorCode, "SEARCH_FAILED");
});