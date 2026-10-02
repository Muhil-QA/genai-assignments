import { createHash } from "node:crypto";
import path from "node:path";
import { Collection, Db, ObjectId } from "mongodb";
import { getDatabase } from "../../../config/database";
import { env } from "../../../config/env";
import { ParsedResume, StoreResumeInput } from "../types/ingestion.types";

interface StoredResumeDocument extends ParsedResume {
	_id: ObjectId;
	fileName: string;
	rawText: string;
	embedding: number[];
	embeddingModel: string;
	embeddingDimension: number;
	createdAt: Date;
	updatedAt: Date;
}

export function createResumeDocumentId(input: StoreResumeInput): ObjectId {
	const stablePayload = JSON.stringify({
		fileName: path.basename(input.fileName.replace(/\\/g, "/")),
		resume: normalizeResume(input.resume),
		rawText: input.rawText,
		embedding: input.embedding,
		embeddingModel: env.mistralEmbedModel,
		embeddingDimension: env.embeddingDimension,
	});
	const digest = createHash("sha256").update(stablePayload).digest().subarray(0, 12);
	return new ObjectId(digest);
}

export class ResumeIngestionRepository {
	constructor(private readonly databaseProvider: () => Promise<Db> = getDatabase) {}

	async findExistingResumeId(fileName: string, rawText: string): Promise<string | null> {
		const database = await this.databaseProvider();
		const fileBaseName = path.basename(fileName.replace(/\\/g, "/"));
		const existing = await database.collection<StoredResumeDocument>("resumes").findOne(
			{ fileName: fileBaseName, rawText },
			{ projection: { _id: 1 } },
		);
		return existing?._id.toHexString() ?? null;
	}

	async storeResume(input: StoreResumeInput): Promise<string> {
		const database = await this.databaseProvider();
		const collection = database.collection<StoredResumeDocument>("resumes");
		const fileName = path.basename(input.fileName.replace(/\\/g, "/"));
		const _id = createResumeDocumentId(input);
		const now = new Date();
		const document: StoredResumeDocument = {
			_id,
			fileName,
			rawText: input.rawText,
			...normalizeResume(input.resume),
			embedding: input.embedding,
			embeddingModel: env.mistralEmbedModel,
			embeddingDimension: env.embeddingDimension,
			createdAt: now,
			updatedAt: now,
		};

		try {
			await collection.insertOne(document);
		} catch (error) {
			if (!isDuplicateKeyError(error)) throw error;
			const existing = await collection.findOne({ _id }, { projection: { _id: 1 } });
			if (!existing) throw error;
		}

		return _id.toHexString();
	}
}

function normalizeResume(resume: ParsedResume): ParsedResume {
	const normalized: ParsedResume = { skills: [...resume.skills] };
	const stringFields = [
		"name", "email", "phone", "location", "company", "role", "education", "experienceSummary",
	] as const;
	for (const field of stringFields) {
		if (typeof resume[field] === "string") normalized[field] = resume[field];
	}
	for (const field of ["totalExperience", "relevantExperience"] as const) {
		if (typeof resume[field] === "number") normalized[field] = resume[field];
	}
	if (Array.isArray(resume.jobTitles)) normalized.jobTitles = [...resume.jobTitles];
	return normalized;
}

function isDuplicateKeyError(error: unknown): boolean {
	return typeof error === "object"
		&& error !== null
		&& "code" in error
		&& (error as { code?: unknown }).code === 11000;
}