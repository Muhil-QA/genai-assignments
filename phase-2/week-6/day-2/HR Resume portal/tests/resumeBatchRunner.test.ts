import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { IngestionApiError } from "../src/middleware/errorHandler";
import { ResumeBatchIngestionService, ResumeBatchRunner } from "../src/modules/ingestion/services/ResumeBatchRunner";

test("ingests project PDF files in batches and reports failures without stopping", async () => {
	const directory = await mkdtemp(join(tmpdir(), "resume-batch-"));
	const ingested: string[] = [];
	const ingestionService: ResumeBatchIngestionService = {
		async ingestResumeFromPath(filePath, fileName) {
			assert.equal(filePath, join(directory, fileName));
			ingested.push(fileName);
			if (fileName === "resume-07.pdf") throw new IngestionApiError("EMBEDDING_FAILED");
			return { resumeId: `id-${fileName}`, alreadyStored: fileName === "resume-01.pdf" };
		},
	};

	try {
		for (let index = 1; index <= 11; index += 1) {
			await writeFile(join(directory, `resume-${String(index).padStart(2, "0")}.pdf`), "test");
		}
		await writeFile(join(directory, "not-a-pdf.docx"), "ignored");

		const result = await new ResumeBatchRunner(ingestionService).ingestDirectory(directory, 5);

		assert.equal(result.batchCount, 3);
		assert.equal(result.processedCount, 10);
		assert.equal(result.skippedCount, 1);
		assert.deepEqual(result.failedFiles, [{ fileName: "resume-07.pdf", stage: "EMBEDDING_FAILED" }]);
		assert.equal(result.resumeIds.length, 10);
		assert.equal(ingested.length, 11);
		assert.ok(ingested.every((fileName) => fileName.endsWith(".pdf")));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});