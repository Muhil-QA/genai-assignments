import assert from "node:assert/strict";
import test from "node:test";
import { SearchCandidate } from "../src/modules/retrieval/types/retrieval.types";
import { deduplicateCandidates, MAX_CANDIDATE_SNIPPET_CHARS } from "../src/modules/retrieval/utils/deduplicate";

function candidate(resumeId: string, overrides: Partial<SearchCandidate> = {}): SearchCandidate {
	return { resumeId, sources: [], ...overrides };
}

test("merges overlapping search lists by resumeId in stable first-seen order", () => {
	const bm25 = [candidate("A", { bm25Score: 8.4, sources: ["bm25"] }), candidate("B", { bm25Score: 7.2, sources: ["bm25"] }), candidate("C", { sources: ["bm25"] })];
	const vector = [candidate("B", { vectorScore: 0.88, sources: ["vector"] }), candidate("D", { sources: ["vector"] }), candidate("A", { vectorScore: 0.91, sources: ["vector"] })];

	const merged = deduplicateCandidates([bm25, vector]);

	assert.deepEqual(merged.map(({ resumeId }) => resumeId), ["A", "B", "C", "D"]);
	assert.deepEqual(merged[0], candidate("A", { bm25Score: 8.4, vectorScore: 0.91, sources: ["bm25", "vector"] }));
	assert.deepEqual(merged[1], candidate("B", { bm25Score: 7.2, vectorScore: 0.88, sources: ["bm25", "vector"] }));
});

test("merges metadata and skills without duplicates while preserving scores", () => {
	const merged = deduplicateCandidates([
		[candidate("A", { name: "Candidate", skills: ["RAG"], matchedSkills: ["RAG"], bm25Score: 8.4, sources: ["bm25"] })],
		[candidate("A", { role: "QA Architect", skills: ["RAG", "DeepEval"], matchedSkills: ["DeepEval"], vectorScore: 0.88, sources: ["vector"] })],
	]);

	assert.deepEqual(merged[0], candidate("A", {
		name: "Candidate",
		role: "QA Architect",
		skills: ["RAG", "DeepEval"],
		matchedSkills: ["RAG", "DeepEval"],
		bm25Score: 8.4,
		vectorScore: 0.88,
		sources: ["bm25", "vector"],
	}));
});

test("caps candidate snippets for downstream LLM use", () => {
	const merged = deduplicateCandidates([[
		candidate("A", { snippet: "x".repeat(MAX_CANDIDATE_SNIPPET_CHARS + 100) }),
	]]);

	assert.equal(merged[0]?.snippet?.length, MAX_CANDIDATE_SNIPPET_CHARS);
});

test("returns an empty pool when there are no candidates", () => {
	assert.deepEqual(deduplicateCandidates([[], []]), []);
});