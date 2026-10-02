import { resolve } from "node:path";
import { closeDatabaseConnection } from "../config/database";
import { ResumeBatchRunner, ResumeBatchSize } from "../modules/ingestion/services/ResumeBatchRunner";

async function main(): Promise<void> {
	const sizeArgument = process.argv[2] ?? "10";
	if (sizeArgument !== "5" && sizeArgument !== "10") {
		throw new Error("Batch size must be 5 or 10. Usage: npm run ingest:batch -- [5|10]");
	}

	try {
		const result = await new ResumeBatchRunner().ingestDirectory(
			resolve(process.cwd(), "Resumes"),
			Number(sizeArgument) as ResumeBatchSize,
		);
		console.log(`Ingested ${result.processedCount - result.skippedCount} new PDFs; skipped ${result.skippedCount} already stored in ${result.batchCount} batches.`);
		if (result.failedFiles.length) {
			console.error(`Failed to ingest ${result.failedFiles.length} PDFs:`);
			for (const failure of result.failedFiles) {
				console.error(`  ${failure.stage}: ${failure.fileName}`);
			}
			process.exitCode = 1;
		}
		console.log("MongoDB collection: resumes");
	} finally {
		await closeDatabaseConnection();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});