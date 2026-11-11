import { ErrorRequestHandler, Response } from "express";
import { MulterError } from "multer";
import { InvalidFileTypeError } from "../config/multerConfig";

export type ApiErrorCode =
	| "FILE_REQUIRED"
	| "INVALID_FILE_TYPE"
	| "FILE_TOO_LARGE"
	| "REQUEST_TOO_LARGE"
	| "RESUME_EXTRACTION_FAILED"
	| "RESUME_PARSE_FAILED"
	| "EMBEDDING_FAILED"
	| "INGESTION_FAILED"
	| "INVALID_REQUEST"
	| "INVALID_SEARCH_QUERY"
	| "SEARCH_FAILED"
	| "SEARCH_UNAVAILABLE"
	| "CANDIDATE_NOT_FOUND"
	| "CANDIDATE_LOOKUP_FAILED"
	| "RERANK_FAILED"
	| "SUMMARY_FAILED"
	| "LLM_PARSER_DISABLED";

const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
	FILE_REQUIRED: { status: 400, message: "Resume PDF is required" },
	INVALID_FILE_TYPE: { status: 415, message: "Only PDF files are allowed" },
	FILE_TOO_LARGE: { status: 413, message: "Resume exceeds maximum upload size" },
	REQUEST_TOO_LARGE: { status: 413, message: "Request body exceeds maximum size" },
	RESUME_EXTRACTION_FAILED: { status: 422, message: "Resume extraction failed" },
	RESUME_PARSE_FAILED: { status: 422, message: "Resume parsing failed" },
	EMBEDDING_FAILED: { status: 502, message: "Mistral embedding failed" },
	INGESTION_FAILED: { status: 503, message: "Resume ingestion failed" },
	INVALID_REQUEST: { status: 400, message: "Request body is invalid" },
	INVALID_SEARCH_QUERY: { status: 400, message: "Search query is invalid" },
	SEARCH_FAILED: { status: 503, message: "Resume search is currently unavailable" },
	SEARCH_UNAVAILABLE: { status: 503, message: "No retrieval strategy is currently available" },
	CANDIDATE_NOT_FOUND: { status: 404, message: "Candidate was not found" },
	CANDIDATE_LOOKUP_FAILED: { status: 503, message: "Candidate profile is currently unavailable" },
	RERANK_FAILED: { status: 502, message: "Candidate reranking failed" },
	SUMMARY_FAILED: { status: 502, message: "Candidate summarization failed" },
	LLM_PARSER_DISABLED: { status: 503, message: "LLM resume parser is disabled" },
};

export class IngestionApiError extends Error {
	constructor(readonly errorCode: ApiErrorCode, message?: string) {
		super(message ?? API_ERRORS[errorCode].message);
		this.name = "IngestionApiError";
	}
}

export function sendApiError(res: Response, errorCode: ApiErrorCode, messageOverride?: string): void {
	const error = API_ERRORS[errorCode];
	const response: { success: false; requestId?: string; errorCode: ApiErrorCode; message: string } = {
		success: false,
		errorCode,
		message: messageOverride ?? error.message,
	};
	if (typeof res.locals.requestId === "string") response.requestId = res.locals.requestId;
	res.status(error.status).json(response);
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
	if (error instanceof IngestionApiError) {
		sendApiError(res, error.errorCode);
		return;
	}

	if (error instanceof InvalidFileTypeError) {
		sendApiError(res, "INVALID_FILE_TYPE");
		return;
	}

	if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
		sendApiError(res, "FILE_TOO_LARGE");
		return;
	}

	if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
		sendApiError(res, "INVALID_REQUEST");
		return;
	}

	if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
		sendApiError(res, "REQUEST_TOO_LARGE");
		return;
	}

	sendApiError(res, "INGESTION_FAILED");
};