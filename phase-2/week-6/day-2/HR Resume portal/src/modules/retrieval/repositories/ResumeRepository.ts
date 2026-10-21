import { Db, Document, ObjectId } from "mongodb";
import { getDatabase } from "../../../config/database";
import { env } from "../../../config/env";
import { Bm25ResumeHit, SearchFilters, StoredResume, VectorResumeHit } from "../types/retrieval.types";
import { MAX_CANDIDATE_SNIPPET_CHARS } from "../utils/deduplicate";

export interface ResumeRepository {
	findById(resumeId: string): Promise<StoredResume | null>;
	findProfileById(resumeId: string): Promise<ResumeProfileDocument | null>;
}

export interface ResumeProfileDocument {
	_id: ObjectId;
	name?: string;
	email?: string;
	phone?: string;
	location?: string;
	company?: string;
	role?: string;
	education?: string;
	totalExperience?: number;
	relevantExperience?: number;
	skills: string[];
	jobTitles?: string[];
	experienceSummary?: string;
	createdAt?: Date;
}

export class MongoResumeRepository implements ResumeRepository {
	constructor(
		private readonly databaseProvider: () => Promise<Db> = getDatabase,
		private readonly bm25Index = env.mongodbBm25SearchIndex,
		private readonly vectorIndex = env.mongodbVectorSearchIndex,
	) {}

	async findById(resumeId: string): Promise<StoredResume | null> {
		if (!ObjectId.isValid(resumeId)) return null;

		const database = await this.databaseProvider();
		return database.collection<StoredResume>("resumes").findOne({ _id: new ObjectId(resumeId) });
	}

	async findProfileById(resumeId: string): Promise<ResumeProfileDocument | null> {
		if (!ObjectId.isValid(resumeId)) return null;

		const database = await this.databaseProvider();
		return database.collection<ResumeProfileDocument>("resumes").findOne(
			{ _id: new ObjectId(resumeId) },
			{
				projection: {
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
				},
			},
		);
	}

	async searchBm25(query: string, filters: SearchFilters, topK: number): Promise<Bm25ResumeHit[]> {
		const compound: Document = {
			must: [{
				text: {
					query,
					path: ["rawText", "skills", "jobTitles", "experienceSummary", "role", "company"],
				},
			}],
		};
		if (filters.minYearsExperience !== undefined) {
			compound.filter = [{
				range: { path: "totalExperience", gte: filters.minYearsExperience },
			}];
		}

		const pipeline: Document[] = [
			{ $search: { index: this.bm25Index, compound } },
			{ $limit: topK },
			{
				$project: {
					_id: 1,
					name: 1,
					role: 1,
					company: 1,
					totalExperience: 1,
					skills: 1,
					snippet: { $substrCP: ["$rawText", 0, MAX_CANDIDATE_SNIPPET_CHARS] },
					bm25Score: { $meta: "searchScore" },
				},
			},
		];

		const database = await this.databaseProvider();
		return database.collection<Bm25ResumeHit>("resumes").aggregate<Bm25ResumeHit>(pipeline).toArray();
	}

	async searchVector(
		queryVector: number[],
		topK: number,
		filters: SearchFilters = {},
		exactRescore = false,
	): Promise<VectorResumeHit[]> {
		if (queryVector.length !== env.embeddingDimension
			|| !queryVector.every((value) => Number.isFinite(value))) {
			throw new Error("Query embedding does not match the configured vector dimension");
		}

		// The vector index has no experience filter field, so filter an oversampled ranked set.
		const candidateLimit = filters.minYearsExperience === undefined
		? topK
		: Math.min(Math.max(topK * 10, 100), 10_000);
		const pipeline: Document[] = [
			{
				$vectorSearch: {
					index: this.vectorIndex,
					path: "embedding",
					queryVector,
					numCandidates: Math.max(candidateLimit * 10, 100),
					limit: candidateLimit,
				},
			},
		];
		if (filters.minYearsExperience !== undefined) {
			pipeline.push({ $match: { totalExperience: { $gte: filters.minYearsExperience } } });
			pipeline.push({ $limit: topK });
		}
		pipeline.push({
				$project: {
					_id: 1,
					name: 1,
					role: 1,
					company: 1,
					totalExperience: 1,
					skills: 1,
					snippet: { $substrCP: ["$rawText", 0, MAX_CANDIDATE_SNIPPET_CHARS] },
					vectorScore: { $meta: "vectorSearchScore" },
					...(exactRescore ? { embedding: 1 } : {}),
				},
			});

		const database = await this.databaseProvider();
		return database.collection<VectorResumeHit>("resumes").aggregate<VectorResumeHit>(pipeline).toArray();
	}
}