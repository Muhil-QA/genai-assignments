import { env } from "../../../config/env";
import { ParsedResume } from "../types/ingestion.types";

const OPTIONAL_STRING_FIELDS = [
	"name",
	"email",
	"phone",
	"location",
	"company",
	"role",
	"education",
	"experienceSummary",
] as const;

export function validateParsedResume(value: unknown): ParsedResume {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("LLM response must be a resume object");
	}

	const input = value as Record<string, unknown>;
	if (!Array.isArray(input.skills) || !input.skills.every((skill) => typeof skill === "string")) {
		throw new Error("LLM response skills must be an array of strings");
	}

	const parsed: ParsedResume = { skills: input.skills };
	for (const field of OPTIONAL_STRING_FIELDS) {
		const fieldValue = input[field];
		if (fieldValue !== undefined && fieldValue !== null) {
			if (typeof fieldValue !== "string") {
				throw new Error(`LLM response ${field} must be a string or null`);
			}
			if (fieldValue.trim()) parsed[field] = fieldValue.trim();
		}
	}

	for (const field of ["totalExperience", "relevantExperience"] as const) {
		const fieldValue = input[field];
		if (fieldValue !== undefined && fieldValue !== null) {
			if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
				throw new Error(`LLM response ${field} must be a non-negative number or null`);
			}
			parsed[field] = fieldValue;
		}
	}

	if (input.jobTitles !== undefined && input.jobTitles !== null) {
		if (!Array.isArray(input.jobTitles) || !input.jobTitles.every((title) => typeof title === "string")) {
			throw new Error("LLM response jobTitles must be an array of strings or null");
		}
		parsed.jobTitles = input.jobTitles;
	}

	return parsed;
}

export class LLMResumeParser {
	async parseResume(rawText: string): Promise<ParsedResume> {
		if (!env.groqApiKey || env.groqApiKey === "YOUR_KEY") {
			throw new Error("LLM parser is enabled but GROQ_API_KEY is not configured");
		}

		const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.groqApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: env.groqModel,
				temperature: 0,
				response_format: { type: "json_object" },
				messages: [
					{
						role: "system",
						content: "Extract resume fields only when supported by the provided text. Do not infer missing facts. Return a JSON object with optional string fields name, email, phone, location, company, role, education, experienceSummary; optional non-negative numbers totalExperience and relevantExperience; optional string array jobTitles; and required string array skills. Use null for unknown optional values.",
					},
					{ role: "user", content: rawText },
				],
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			throw new Error(`LLM provider returned HTTP ${response.status}`);
		}

		const payload: unknown = await response.json();
		if (!payload || typeof payload !== "object") {
			throw new Error("LLM provider returned an invalid response");
		}

		const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
		const content = choices?.[0]?.message?.content;
		if (typeof content !== "string") {
			throw new Error("LLM provider returned no structured content");
		}

		return validateParsedResume(JSON.parse(content) as unknown);
	}
}