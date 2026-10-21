import assert from "node:assert/strict";
import test from "node:test";
import { Collection, Db } from "mongodb";
import { createResumeDocumentId, ResumeIngestionRepository } from "../src/modules/ingestion/repositories/ResumeIngestionRepository";

const input = {
	fileName: "resume.pdf",
	resume: { name: "Test Candidate", skills: ["RAG"] },
	rawText: "Resume content",
	embedding: [0.1, 0.2, 0.3],
};

test("creates a deterministic resume ID for identical store input", () => {
	assert.equal(createResumeDocumentId(input).toHexString(), createResumeDocumentId(input).toHexString());
});

test("normalizes client path components before deriving the document ID", () => {
	const withWindowsPath = { ...input, fileName: "C:\\uploads\\resume.pdf" };
	const withUnixPath = { ...input, fileName: "/uploads/resume.pdf" };
	assert.equal(createResumeDocumentId(withWindowsPath).toHexString(), createResumeDocumentId(withUnixPath).toHexString());
});

test("inserts a flattened document once and reuses its ID on duplicate key", async () => {
	let storedDocument: Record<string, unknown> | undefined;
	let insertCalls = 0;
	const collection = {
		async insertOne(document: Record<string, unknown>) {
			insertCalls += 1;
			if (storedDocument) throw Object.assign(new Error("duplicate"), { code: 11000 });
			storedDocument = document;
			return { acknowledged: true, insertedId: document._id };
		},
		async findOne() {
			return storedDocument ? { _id: storedDocument._id } : null;
		},
	} as unknown as Collection;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new ResumeIngestionRepository(async () => database);

	const firstId = await repository.storeResume(input);
	const secondId = await repository.storeResume(input);

	assert.equal(firstId, secondId);
	assert.equal(insertCalls, 2);
	assert.ok(storedDocument);
	assert.equal(storedDocument.fileName, "resume.pdf");
	assert.equal(storedDocument.rawText, "Resume content");
	assert.deepEqual(storedDocument.skills, ["RAG"]);
	assert.equal("resume" in storedDocument, false);
});