import assert from "node:assert/strict";
import test from "node:test";
import { Db } from "mongodb";
import { RetrievalValidationService } from "../src/modules/retrieval/services/RetrievalValidationService";

function createService(stats?: {
	resumeCount: number;
	resumesWithEmbedding: number;
	compatibleResumeCount: number;
}): RetrievalValidationService {
	const collection = {
		aggregate: () => ({ toArray: async () => stats ? [stats] : [] }),
	};
	const database = { collection: () => collection } as unknown as Db;
	return new RetrievalValidationService(async () => database, "mistral-embed", 1024);
}

test("readiness reports compatible stored embeddings", async () => {
	const readiness = await createService({
		resumeCount: 3,
		resumesWithEmbedding: 2,
		compatibleResumeCount: 1,
	}).getReadiness();

	assert.deepEqual(readiness, {
		ready: true,
		collection: "resumes",
		resumeCount: 3,
		resumesWithEmbedding: 2,
		embeddingModel: "mistral-embed",
		embeddingDimension: 1024,
	});
});

test("readiness reports when no ingested resumes exist", async () => {
	assert.deepEqual(await createService().getReadiness(), {
		ready: false,
		reason: "No ingested resumes are available",
	});
});

test("readiness rejects resumes without embeddings", async () => {
	assert.deepEqual(await createService({
		resumeCount: 2,
		resumesWithEmbedding: 0,
		compatibleResumeCount: 0,
	}).getReadiness(), {
		ready: false,
		reason: "No ingested resume embeddings are available",
	});
});

test("readiness rejects vectors incompatible with configured model or dimension", async () => {
	assert.deepEqual(await createService({
		resumeCount: 1,
		resumesWithEmbedding: 1,
		compatibleResumeCount: 0,
	}).getReadiness(), {
		ready: false,
		reason: "No resume embeddings match the configured model and dimension",
	});
});