import assert from "node:assert/strict";
import test from "node:test";
import { cleanResumeText } from "../src/modules/ingestion/utils/textCleaner";

test("normalizes line endings, whitespace, and blank lines", () => {
	assert.equal(
		cleanResumeText("Rajesh Mohan Kumar\r\n\r\n\r\n Test Architect   & Senior Engineer \t\r\n RAG"),
		"Rajesh Mohan Kumar\nTest Architect & Senior Engineer\nRAG",
	);
});

test("preserves useful technology punctuation and separates control characters", () => {
	assert.equal(cleanResumeText("C#  C++  .NET\u0001Java"), "C# C++ .NET Java");
});