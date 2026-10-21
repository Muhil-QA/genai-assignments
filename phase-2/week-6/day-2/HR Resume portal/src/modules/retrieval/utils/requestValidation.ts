import { SearchFilters } from "../types/retrieval.types";

export function parseSearchFilters(value: unknown): SearchFilters | null {
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	const input = value as Record<string, unknown>;
	if (Object.keys(input).some((key) => key !== "minYearsExperience")) return null;
	if (input.minYearsExperience === undefined) return {};
	if (typeof input.minYearsExperience !== "number"
		|| !Number.isFinite(input.minYearsExperience)
		|| input.minYearsExperience < 0) return null;

	return { minYearsExperience: input.minYearsExperience };
}