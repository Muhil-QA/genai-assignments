import assert from "node:assert/strict";
import test from "node:test";
import { Collection, Db, ObjectId } from "mongodb";
import { MongoResumeRepository } from "../src/modules/retrieval/repositories/ResumeRepository";
import { StoredResume } from "../src/modules/retrieval/types/retrieval.types";

test("finds a stored resume by its MongoDB ObjectId without writing", async () => {
	const resumeId = new ObjectId();
	const resume = {
		_id: resumeId,
		name: "Test Candidate",
		skills: ["RAG"],
		rawText: "Resume body",
		embedding: [0.1, 0.2],
	} as StoredResume;
	let filter: Record<string, unknown> | undefined;
	const collection = {
		async findOne(query: Record<string, unknown>) {
			filter = query;
			return resume;
		},
	} as unknown as Collection<StoredResume>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	assert.equal(await repository.findById(resumeId.toHexString()), resume);
	assert.ok(filter?._id instanceof ObjectId);
	assert.equal((filter?._id as ObjectId).toHexString(), resumeId.toHexString());
});

test("returns null for an invalid resume ID without accessing MongoDB", async () => {
	let databaseAccessed = false;
	const repository = new MongoResumeRepository(async () => {
		databaseAccessed = true;
		throw new Error("Database must not be accessed for an invalid ID");
	});

	assert.equal(await repository.findById("not-an-object-id"), null);
	assert.equal(databaseAccessed, false);
});

test("returns null when a valid resume ID is not found", async () => {
	const collection = { findOne: async () => null } as unknown as Collection<StoredResume>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	assert.equal(await repository.findById(new ObjectId().toHexString()), null);
});

test("finds a candidate profile using an allowlisted MongoDB projection", async () => {
	const resumeId = new ObjectId();
	const profile = {
		_id: resumeId,
		name: "Test Candidate",
		email: "candidate@example.com",
		skills: ["RAG"],
	};
	let query: Record<string, unknown> | undefined;
	let options: Record<string, unknown> | undefined;
	const collection = {
		async findOne(receivedQuery: Record<string, unknown>, receivedOptions: Record<string, unknown>) {
			query = receivedQuery;
			options = receivedOptions;
			return profile;
		},
	} as unknown as Collection<StoredResume>;
	const database = { collection: () => collection } as unknown as Db;
	const repository = new MongoResumeRepository(async () => database);

	assert.equal(await repository.findProfileById(resumeId.toHexString()), profile);
	assert.ok(query?._id instanceof ObjectId);
	assert.deepEqual((options?.projection as Record<string, unknown>), {
		name: 1,
		email: 1,
		phone: 1,
		location: 1,
		company: 1,
		role: 1,
		education: 1,
		totalExperience: 1,
		relevantExperience: 1,
		skills: 1,
		jobTitles: 1,
		experienceSummary: 1,
		createdAt: 1,
	});
});

test("does not query MongoDB for an invalid profile ID", async () => {
	let databaseAccessed = false;
	const repository = new MongoResumeRepository(async () => {
		databaseAccessed = true;
		throw new Error("Database must not be accessed for an invalid ID");
	});

	assert.equal(await repository.findProfileById("invalid-id"), null);
	assert.equal(databaseAccessed, false);
});