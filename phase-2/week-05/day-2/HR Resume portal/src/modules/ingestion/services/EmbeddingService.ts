import { env } from "../../../config/env";

export interface EmbeddingInput {
	name?: string;
	role?: string;
	skills: string[];
	company?: string;
	experienceSummary?: string;
	rawText: string;
}

export interface EmbeddingServiceConfig {
	apiKey?: string;
	model: string;
	dimension: number;
}

export function buildEmbeddingText(input: EmbeddingInput): string {
	return [
		input.name ?? "",
		input.role ?? "",
		input.skills.join(", "),
		input.company ?? "",
		input.experienceSummary ?? "",
		input.rawText,
	].join("\n");
}

export class EmbeddingService {
	constructor(
		private readonly config: EmbeddingServiceConfig = {
			apiKey: env.mistralApiKey,
			model: env.mistralEmbedModel,
			dimension: env.embeddingDimension,
		},
		private readonly fetcher: typeof fetch = fetch,
	) {}

	async generateEmbedding(input: EmbeddingInput): Promise<number[]> {
		if (!this.config.apiKey || this.config.apiKey === "YOUR_KEY") {
			throw new Error("MISTRAL_API_KEY is not configured");
		}

		const response = await this.fetcher("https://api.mistral.ai/v1/embeddings", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: this.config.model,
				input: buildEmbeddingText(input),
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			throw new Error(`Mistral API returned HTTP ${response.status}`);
		}

		const payload: unknown = await response.json();
		if (!payload || typeof payload !== "object") {
			throw new Error("Mistral API returned an invalid response");
		}

		const data = (payload as { data?: Array<{ embedding?: unknown }> }).data;
		const embedding = data?.[0]?.embedding;
		if (!Array.isArray(embedding)
			|| !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
			|| embedding.length !== this.config.dimension) {
			throw new Error("Mistral API returned an invalid embedding vector");
		}

		return embedding;
	}
}