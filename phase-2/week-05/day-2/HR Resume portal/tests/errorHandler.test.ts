import assert from "node:assert/strict";
import test from "node:test";
import { ApiErrorCode, sendApiError } from "../src/middleware/errorHandler";

const expected: Array<[ApiErrorCode, number, string]> = [
	["FILE_REQUIRED", 400, "Resume PDF is required"],
	["INVALID_FILE_TYPE", 415, "Only PDF files are allowed"],
	["FILE_TOO_LARGE", 413, "Resume exceeds maximum upload size"],
	["RESUME_EXTRACTION_FAILED", 422, "Resume extraction failed"],
	["RESUME_PARSE_FAILED", 422, "Resume parsing failed"],
	["EMBEDDING_FAILED", 502, "Mistral embedding failed"],
	["INGESTION_FAILED", 503, "Resume ingestion failed"],
];

for (const [errorCode, status, message] of expected) {
	test(`maps ${errorCode} to a stable response`, () => {
		let actualStatus = 0;
		let actualBody: unknown;
		const response = {
				locals: { requestId: "6f30b4aa-5abc-4ac4-9c88-6d6726e01de9" },
			status(code: number) {
				actualStatus = code;
				return this;
			},
			json(body: unknown) {
				actualBody = body;
				return this;
			},
		} as Parameters<typeof sendApiError>[0];

		sendApiError(response, errorCode);
		assert.equal(actualStatus, status);
		assert.deepEqual(actualBody, {
			success: false,
			requestId: "6f30b4aa-5abc-4ac4-9c88-6d6726e01de9",
			errorCode,
			message,
		});
	});
}