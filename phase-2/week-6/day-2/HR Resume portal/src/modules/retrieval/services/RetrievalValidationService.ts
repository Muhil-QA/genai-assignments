import { Db } from "mongodb";
import { getDatabase } from "../../../config/database";
import { env } from "../../../config/env";

interface ReadinessStats {
	resumeCount: number;
	resumesWithEmbedding: number;
	compatibleResumeCount: number;
}

export type RetrievalReadiness =
	| {
			ready: true;
			collection: string;
			resumeCount: number;
			resumesWithEmbedding: number;
			embeddingModel: string;
			embeddingDimension: number;
	  }
	| { ready: false; reason: string };

export class RetrievalValidationService {
	constructor(
		private readonly databaseProvider: () => Promise<Db> = getDatabase,
		private readonly embeddingModel = env.mistralEmbedModel,
		private readonly embeddingDimension = env.embeddingDimension,
	) {}

	async getReadiness(): Promise<RetrievalReadiness> {
		const database = await this.databaseProvider();
		const [stats] = await database.collection("resumes").aggregate<ReadinessStats>([
			{
				$project: {
					embeddingLength: {
						$cond: [
							{ $isArray: "$embedding" },
							{ $size: "$embedding" },
							0,
						],
					},
					embeddingDimension: 1,
					embeddingModel: 1,
				},
			},
			{
				$group: {
					_id: null,
					resumeCount: { $sum: 1 },
					resumesWithEmbedding: {
						$sum: { $cond: [{ $gt: ["$embeddingLength", 0] }, 1, 0] },
					},
					compatibleResumeCount: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $gt: ["$embeddingLength", 0] },
										{ $eq: ["$embeddingLength", this.embeddingDimension] },
										{ $eq: ["$embeddingDimension", this.embeddingDimension] },
										{ $eq: ["$embeddingModel", this.embeddingModel] },
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
		]).toArray();

		if (!stats || stats.resumeCount === 0) {
			return { ready: false, reason: "No ingested resumes are available" };
		}

		if (stats.resumesWithEmbedding === 0) {
			return { ready: false, reason: "No ingested resume embeddings are available" };
		}

		if (stats.compatibleResumeCount === 0) {
			return {
				ready: false,
				reason: "No resume embeddings match the configured model and dimension",
			};
		}

		return {
			ready: true,
			collection: "resumes",
			resumeCount: stats.resumeCount,
			resumesWithEmbedding: stats.resumesWithEmbedding,
			embeddingModel: this.embeddingModel,
			embeddingDimension: this.embeddingDimension,
		};
	}
}