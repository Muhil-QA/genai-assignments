import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { IngestionApiError } from "../../../middleware/errorHandler";
import { ResumeIngestionService } from "./ResumeIngestionService";

export type ResumeBatchSize = 5 | 10;

export interface ResumeBatchIngestionService {
	ingestResumeFromPath(
		filePath: string,
		fileName: string,
		options?: { skipExisting?: boolean },
	): Promise<{ resumeId: string; alreadyStored?: boolean }>;
}

export interface ResumeBatchResult {
	processedCount: number;
	skippedCount: number;
	failedFiles: Array<{ fileName: string; stage: string }>;
	batchCount: number;
	resumeIds: string[];
}

export class ResumeBatchRunner {
	constructor(private readonly ingestionService: ResumeBatchIngestionService = new ResumeIngestionService()) {}

	async ingestDirectory(directory: string, batchSize: ResumeBatchSize): Promise<ResumeBatchResult> {
		if (batchSize !== 5 && batchSize !== 10) {
			throw new Error("Batch size must be 5 or 10");
		}

		const files = (await readdir(directory, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".pdf"))
			.map((entry) => entry.name)
			.sort((left, right) => left.localeCompare(right));
		const failedFiles: Array<{ fileName: string; stage: string }> = [];
		const resumeIds: string[] = [];
		let skippedCount = 0;

		for (let offset = 0; offset < files.length; offset += batchSize) {
			const batch = files.slice(offset, offset + batchSize);
			for (const fileName of batch) {
				try {
					const result = await this.ingestionService.ingestResumeFromPath(
						resolve(directory, fileName),
						fileName,
						{ skipExisting: true },
					);
					resumeIds.push(result.resumeId);
					if (result.alreadyStored) skippedCount += 1;
				} catch (error) {
					failedFiles.push({
						fileName,
						stage: error instanceof IngestionApiError ? error.errorCode : "UNKNOWN_ERROR",
					});
				}
			}
		}

		return {
			processedCount: resumeIds.length,
			skippedCount,
			failedFiles,
			batchCount: Math.ceil(files.length / batchSize),
			resumeIds,
		};
	}
}