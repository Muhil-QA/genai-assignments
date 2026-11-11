import { RequestHandler } from "express";
import { detectSkills } from "../../../config/skills";
import { unlink } from "node:fs/promises";
import { AlgorithmResumeParser } from "../services/AlgorithmResumeParser";
import { env } from "../../../config/env";
import { LLMResumeParser } from "../services/LLMResumeParser";
import { ResumeParserService } from "../services/ResumeParserService";
import { EmbeddingInput, EmbeddingService } from "../services/EmbeddingService";
import { ResumeIngestionRepository } from "../repositories/ResumeIngestionRepository";
import { ParsedResume, StoreResumeInput } from "../types/ingestion.types";
import { ResumeIngestionService } from "../services/ResumeIngestionService";
import { cleanResumeText } from "../utils/textCleaner";
import { IngestionApiError, sendApiError } from "../../../middleware/errorHandler";

const resumeParserService = new ResumeParserService();
const algorithmResumeParser = new AlgorithmResumeParser();
const llmResumeParser = new LLMResumeParser();
const embeddingService = new EmbeddingService();
const resumeIngestionRepository = new ResumeIngestionRepository();
const resumeIngestionService = new ResumeIngestionService();

export const getIngestionHealth: RequestHandler = (_req, res) => {
  res.status(200).json({
    status: "ok",
    module: "resume-ingestion",
  });
};

export const uploadResume: RequestHandler = (req, res) => {
  if (!req.file) {
    sendApiError(res, "FILE_REQUIRED");
    return;
  }

  res.status(201).json({
    success: true,
    message: "Resume uploaded successfully",
    file: {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
};

export const extractResumeText: RequestHandler = async (req, res) => {
  if (!req.file) {
    sendApiError(res, "FILE_REQUIRED");
    return;
  }

  const filePath = req.file.path;

  try {
    const rawText = await resumeParserService.extractTextFromPdf(filePath);
    if (!rawText.trim()) {
      sendApiError(res, "RESUME_EXTRACTION_FAILED");
      return;
    }

    res.status(200).json({
      success: true,
      rawText,
      characters: rawText.length,
    });
  } catch {
    sendApiError(res, "RESUME_EXTRACTION_FAILED");
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
};

export const cleanResume: RequestHandler = (req, res) => {
  const { rawText } = req.body ?? {};

  if (typeof rawText !== "string") {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  res.status(200).json({
    success: true,
    cleanText: cleanResumeText(rawText),
  });
};

export const detectResumeSkills: RequestHandler = (req, res) => {
  const { rawText } = req.body ?? {};

  if (typeof rawText !== "string") {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  res.status(200).json({
    success: true,
    skills: detectSkills(rawText),
  });
};

export const parseResume: RequestHandler = (req, res) => {
  const { rawText } = req.body ?? {};

  if (typeof rawText !== "string" || !rawText.trim()) {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  if (env.useLlmParser) {
    void llmResumeParser.parseResume(rawText)
      .then((resume) => res.status(200).json({ success: true, resume }))
      .catch(() => sendApiError(res, "RESUME_PARSE_FAILED"));
    return;
  }

  try {
    res.status(200).json({
      success: true,
      resume: algorithmResumeParser.parseResume(rawText),
    });
  } catch {
    sendApiError(res, "RESUME_PARSE_FAILED");
  }
};

export const parseResumeWithLlm: RequestHandler = (req, res) => {
  if (!env.useLlmParser) {
    sendApiError(res, "LLM_PARSER_DISABLED");
    return;
  }

  const { rawText } = req.body ?? {};
  if (typeof rawText !== "string" || !rawText.trim()) {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  void llmResumeParser.parseResume(rawText)
    .then((resume) => res.status(200).json({ success: true, resume }))
    .catch(() => sendApiError(res, "RESUME_PARSE_FAILED"));
};

export const embedResume: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  const { rawText, skills } = body;
  const optionalStringFields = ["name", "role", "company", "experienceSummary"];

  if (typeof rawText !== "string" || !rawText.trim()
    || !Array.isArray(skills)
    || !skills.every((skill: unknown) => typeof skill === "string")
    || optionalStringFields.some((field) => body[field] !== undefined && typeof body[field] !== "string")) {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  const input: EmbeddingInput = {
    name: body.name,
    role: body.role,
    skills,
    company: body.company,
    experienceSummary: body.experienceSummary,
    rawText,
  };

  try {
    const embedding = await embeddingService.generateEmbedding(input);
    res.status(200).json({
      success: true,
      model: env.mistralEmbedModel,
      dimension: embedding.length,
      embedding,
    });
  } catch {
    sendApiError(res, "EMBEDDING_FAILED");
  }
};

export const storeResume: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  if (!isValidStoreResumeInput(body)) {
    sendApiError(res, "INVALID_REQUEST");
    return;
  }

  try {
    const resumeId = await resumeIngestionRepository.storeResume(body);
    res.status(201).json({
      success: true,
      message: "Resume stored successfully",
      resumeId,
    });
  } catch {
    sendApiError(res, "INGESTION_FAILED");
  }
};

function isValidStoreResumeInput(value: unknown): value is StoreResumeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (typeof input.fileName !== "string" || !input.fileName.trim()) return false;
  if (typeof input.rawText !== "string" || !input.rawText.trim()) return false;
  if (!Array.isArray(input.embedding)
    || input.embedding.length !== env.embeddingDimension
    || !input.embedding.every((entry) => typeof entry === "number" && Number.isFinite(entry))) return false;

  if (!input.resume || typeof input.resume !== "object" || Array.isArray(input.resume)) return false;
  const resume = input.resume as Record<string, unknown>;
  if (!Array.isArray(resume.skills) || !resume.skills.every((skill) => typeof skill === "string")) return false;

  const stringFields = [
    "name", "email", "phone", "location", "company", "role", "education", "experienceSummary",
  ];
  if (stringFields.some((field) => resume[field] !== undefined && resume[field] !== null && typeof resume[field] !== "string")) return false;
  const numericFields = ["totalExperience", "relevantExperience"];
  if (numericFields.some((field) => resume[field] !== undefined && resume[field] !== null
    && (typeof resume[field] !== "number" || !Number.isFinite(resume[field] as number) || (resume[field] as number) < 0))) return false;
  if (resume.jobTitles !== undefined && resume.jobTitles !== null
    && (!Array.isArray(resume.jobTitles) || !resume.jobTitles.every((title) => typeof title === "string"))) return false;

  return true;
}

export const ingestResume: RequestHandler = async (req, res) => {
  if (!req.file) {
    sendApiError(res, "FILE_REQUIRED");
    return;
  }

  try {
    const result = await resumeIngestionService.ingestResume(req.file);
    res.locals.ingestionTimings = result.timings;
    res.status(200).json({
      success: true,
      message: "Resume ingestion completed",
      ...result,
    });
  } catch (error) {
    if (error instanceof IngestionApiError) {
      sendApiError(res, error.errorCode);
      return;
    }
    sendApiError(res, "INGESTION_FAILED");
  }
};