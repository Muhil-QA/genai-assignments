import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ResumeParserService } from "../src/modules/ingestion/services/ResumeParserService";

test("returns embedded PDF text without starting OCR", async () => {
	const directory = await mkdtemp(join(tmpdir(), "resume-parser-"));
	const filePath = join(directory, "embedded.pdf");
	let ocrStarted = false;
	let parserDestroyed = false;
	await writeFile(filePath, "pdf-data");

	try {
		const parser = new ResumeParserService(
			() => ({
				async getText() { return { text: "Name: Embedded Candidate" }; },
				async getScreenshot() { throw new Error("OCR should not be used"); },
				async destroy() { parserDestroyed = true; },
			}),
			async () => {
				ocrStarted = true;
				throw new Error("OCR should not be used");
			},
		);

		assert.equal(await parser.extractTextFromPdf(filePath), "Name: Embedded Candidate");
		assert.equal(ocrStarted, false);
		assert.equal(parserDestroyed, true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("OCRs rendered pages when embedded text is unusable and terminates the worker", async () => {
	const directory = await mkdtemp(join(tmpdir(), "resume-parser-"));
	const filePath = join(directory, "scanned.pdf");
	const recognizedPages: Uint8Array[] = [];
	let workerTerminated = false;
	await writeFile(filePath, "pdf-data");

	try {
		const parser = new ResumeParserService(
			() => ({
				async getText() { return { text: "\u0000\u0001  " }; },
				async getScreenshot() { return { pages: [{ data: new Uint8Array([1]) }, { data: new Uint8Array([2]) }] }; },
				async destroy() {},
			}),
			async () => ({
				async recognize(image) {
					recognizedPages.push(image);
					return { data: { text: `OCR page ${image[0]}` } } as Awaited<ReturnType<import("tesseract.js").Worker["recognize"]>>;
				},
				async terminate() { workerTerminated = true; return { jobId: "test", data: {} }; },
			}),
		);

		assert.equal(await parser.extractTextFromPdf(filePath), "OCR page 1\nOCR page 2");
		assert.equal(recognizedPages.length, 2);
		assert.equal(workerTerminated, true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});