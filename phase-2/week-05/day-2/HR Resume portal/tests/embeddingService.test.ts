import assert from "node:assert/strict";
import test from "node:test";
import { buildEmbeddingText, EmbeddingService } from "../src/modules/ingestion/services/EmbeddingService";

const input = {
	name: "Rajesh Mohan Kumar",
	role: "Test Architect",
	skills: ["RAG", "DeepEval"],
	company: "Testleaf",
	experienceSummary: "QA architecture",
	rawText: "Resume body",
};

test("builds embedding input from resume context", () => {
	assert.equal(buildEmbeddingText(input), [
		"Rajesh Mohan Kumar",
		"Test Architect",
		"RAG, DeepEval",
		"Testleaf",
		"QA architecture",
		"Resume body",
	].join("\n"));
});

test("sends Mistral request and accepts a correctly sized numeric vector", async () => {
	let sentBody: Record<string, unknown> | undefined;
	const service = new EmbeddingService({ apiKey: "test-key", model: "mistral-embed", dimension: 3 }, async (_url, init) => {
		sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
		return new Response(JSON.stringify({ data: [{ embedding: [0.1, -0.2, 0.3] }] }), { status: 200 });
	});

	assert.deepEqual(await service.generateEmbedding(input), [0.1, -0.2, 0.3]);
	assert.equal(sentBody?.model, "mistral-embed");
	assert.equal(sentBody?.input, buildEmbeddingText(input));
});

test("rejects vectors with wrong dimensions or non-numeric values", async () => {
	const wrongDimension = new EmbeddingService({ apiKey: "test-key", model: "mistral-embed", dimension: 2 }, async () =>
		new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { status: 200 }));
	const nonNumeric = new EmbeddingService({ apiKey: "test-key", model: "mistral-embed", dimension: 1 }, async () =>
		new Response(JSON.stringify({ data: [{ embedding: ["bad"] }] }), { status: 200 }));

	await assert.rejects(wrongDimension.generateEmbedding(input));
	await assert.rejects(nonNumeric.generateEmbedding(input));
});

test("does not call Mistral when the API key is unconfigured", async () => {
	let called = false;
	const service = new EmbeddingService({ apiKey: "YOUR_KEY", model: "mistral-embed", dimension: 3 }, async () => {
		called = true;
		return new Response();
	});

	await assert.rejects(service.generateEmbedding(input));
	assert.equal(called, false);
});