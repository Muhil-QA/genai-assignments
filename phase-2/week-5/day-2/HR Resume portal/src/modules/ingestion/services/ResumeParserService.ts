import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { createWorker, Worker } from "tesseract.js";
import { cleanResumeText } from "../utils/textCleaner";

interface PdfDocumentParser {
	getText(params?: { pageJoiner?: string }): Promise<{ text: string }>;
	getScreenshot(params?: {
		desiredWidth?: number;
		imageBuffer?: boolean;
		imageDataUrl?: boolean;
	}): Promise<{ pages: Array<{ data: Uint8Array }> }>;
	destroy(): Promise<void>;
}

type OcrWorker = Pick<Worker, "recognize" | "terminate">;

export class ResumeParserService {
	constructor(
		private readonly createPdfParser: (data: Uint8Array) => PdfDocumentParser = (data) => new PDFParse({ data }),
		private readonly createOcrWorker: () => Promise<OcrWorker> = () => createWorker("eng"),
	) {}

	async extractTextFromPdf(filePath: string): Promise<string> {
		const parser = this.createPdfParser(await readFile(filePath));

		try {
			const result = await parser.getText({ pageJoiner: "" });
			if (cleanResumeText(result.text)) return result.text;

			const screenshots = await parser.getScreenshot({
				desiredWidth: 1800,
				imageBuffer: true,
				imageDataUrl: false,
			});
			if (screenshots.pages.length === 0) return result.text;

			const worker = await this.createOcrWorker();
			try {
				const pageTexts: string[] = [];
				for (const page of screenshots.pages) {
					const recognized = await worker.recognize(Buffer.from(page.data));
					pageTexts.push(recognized.data.text);
				}
				return pageTexts.join("\n");
			} finally {
				await worker.terminate();
			}
		} finally {
			await parser.destroy();
		}
	}
}