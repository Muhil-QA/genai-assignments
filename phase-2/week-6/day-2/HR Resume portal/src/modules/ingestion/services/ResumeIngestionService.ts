import { unlink } from "node:fs/promises";
import { env } from "../../../config/env";
import { detectSkills } from "../../../config/skills";
import { ResumeIngestionRepository } from "../repositories/ResumeIngestionRepository";
import { AlgorithmResumeParser } from "./AlgorithmResumeParser";
import { EmbeddingService } from "./EmbeddingService";
import { LLMResumeParser } from "./LLMResumeParser";
import { ResumeParserService } from "./ResumeParserService";
import { cleanResumeText } from "../utils/textCleaner";
import { ParsedResume } from "../types/ingestion.types";
import { IngestionApiError } from "../../../middleware/errorHandler";

export interface ResumeIngestionResult {
	resumeId: string;
	alreadyStored?: boolean;
	data: {
		name?: string;
		role?: string;
		company?: string;
		totalExperience?: number;
		skillsCount: number;
		embeddingModel: string;
		embeddingDimension: number;
	};
	timings: {
		extractMs: number;
		cleanMs: number;
		parseMs: number;
		embeddingMs: number;
		mongoInsertMs: number;
		totalMs: number;
	};
}

const elapsedMs = (startedAt: number): number => Math.round(performance.now() - startedAt);

export class ResumeIngestionService {
	constructor(
		private readonly pdfParser = new ResumeParserService(),
		private readonly algorithmParser = new AlgorithmResumeParser(),
		private readonly llmParser = new LLMResumeParser(),
		private readonly embeddingService = new EmbeddingService(),
		private readonly repository = new ResumeIngestionRepository(),
	) {}

	async ingestResume(file: Express.Multer.File): Promise<ResumeIngestionResult> {
		try {
			return await this.ingestResumeFromPath(file.path, file.originalname);
		} finally {
			await unlink(file.path).catch(() => undefined);
		}
	}

	async ingestResumeFromPath(
		filePath: string,
		fileName: string,
		options: { skipExisting?: boolean } = {},
	): Promise<ResumeIngestionResult> {
		const totalStartedAt = performance.now();
		const timings = {
			extractMs: 0,
			cleanMs: 0,
			parseMs: 0,
			embeddingMs: 0,
			mongoInsertMs: 0,
			totalMs: 0,
		};

		let stageStartedAt = performance.now();
		let extractedText: string;
		try {
			extractedText = await this.pdfParser.extractTextFromPdf(filePath);
		} catch {
			throw new IngestionApiError("RESUME_EXTRACTION_FAILED");
		}
		timings.extractMs = elapsedMs(stageStartedAt);

		stageStartedAt = performance.now();
		const rawText = cleanResumeText(extractedText);
		timings.cleanMs = elapsedMs(stageStartedAt);
		if (!rawText) throw new IngestionApiError("RESUME_EXTRACTION_FAILED");
		if (options.skipExisting) {
			stageStartedAt = performance.now();
			let existingResumeId: string | null;
			try {
				existingResumeId = await this.repository.findExistingResumeId(fileName, rawText);
			} catch {
				throw new IngestionApiError("INGESTION_FAILED");
			}
			timings.mongoInsertMs = elapsedMs(stageStartedAt);
			if (existingResumeId) {
				timings.totalMs = elapsedMs(totalStartedAt);
				return {
					resumeId: existingResumeId,
					alreadyStored: true,
					data: {
						skillsCount: 0,
						embeddingModel: env.mistralEmbedModel,
						embeddingDimension: env.embeddingDimension,
					},
					timings,
				};
			}
		}

		stageStartedAt = performance.now();
		let resume: ParsedResume;
		try {
			resume = env.useLlmParser
				? await this.llmParser.parseResume(rawText)
				: this.algorithmParser.parseResume(rawText);
		} catch {
			throw new IngestionApiError("RESUME_PARSE_FAILED");
		}
		resume.skills = mergeSkills(resume.skills, detectSkills(rawText));
		timings.parseMs = elapsedMs(stageStartedAt);

		stageStartedAt = performance.now();
		let embedding: number[];
		try {
			embedding = await this.embeddingService.generateEmbedding({
				name: resume.name,
				role: resume.role,
				skills: resume.skills,
				company: resume.company,
				experienceSummary: resume.experienceSummary,
				rawText,
			});
		} catch {
			throw new IngestionApiError("EMBEDDING_FAILED");
		}
		timings.embeddingMs = elapsedMs(stageStartedAt);

		stageStartedAt = performance.now();
		let resumeId: string;
		try {
			resumeId = await this.repository.storeResume({ fileName, resume, rawText, embedding });
		} catch {
			throw new IngestionApiError("INGESTION_FAILED");
		}
		timings.mongoInsertMs = elapsedMs(stageStartedAt);
		timings.totalMs = elapsedMs(totalStartedAt);

		return {
			resumeId,
			data: {
				name: resume.name,
				role: resume.role,
				company: resume.company,
				totalExperience: resume.totalExperience,
				skillsCount: resume.skills.length,
				embeddingModel: env.mistralEmbedModel,
				embeddingDimension: embedding.length,
			},
			timings,
		};
	}
}

function mergeSkills(parsedSkills: string[], detectedSkills: string[]): string[] {
	const merged = new Map<string, string>();
	for (const skill of [...parsedSkills, ...detectedSkills]) {
		const normalized = skill.toLocaleLowerCase();
		if (!merged.has(normalized)) merged.set(normalized, skill);
	}
	return [...merged.values()];
}