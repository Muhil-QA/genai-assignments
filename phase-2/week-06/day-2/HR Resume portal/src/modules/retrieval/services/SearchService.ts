import {
  HybridSearchResult,
  SearchCandidate,
  SearchFilters,
} from "../types/retrieval.types";
import {
  EndToEndSearchOptions,
  EndToEndSearchResult,
} from "../types/retrieval.types";
import { MongoResumeRepository } from "../repositories/ResumeRepository";
import { EmbeddingService } from "../../ingestion/services/EmbeddingService";
import {
  GroqApiError,
  GroqLLMService,
  LLMOutputError,
  LLMService,
} from "./LLMService";
import { deduplicateCandidates } from "../utils/deduplicate";

export interface SearchService {
  bm25Search(
    query: string,
    filters: SearchFilters,
    topK: number,
  ): Promise<SearchCandidate[]>;
  vectorSearch(
    query: string,
    filters: SearchFilters,
    topK: number,
    exactRescore?: boolean,
  ): Promise<SearchCandidate[]>;
  vectorSearchByEmbedding(
    queryVector: number[],
    filters: SearchFilters,
    topK: number,
    exactRescore?: boolean,
  ): Promise<SearchCandidate[]>;
  hybridSearch(
    query: string,
    filters: SearchFilters,
    topK: number,
  ): Promise<HybridSearchResult>;
  endToEndSearch(
    query: string,
    filters: SearchFilters,
    options?: EndToEndSearchOptions,
    requestId?: string,
  ): Promise<EndToEndSearchResult>;
}

export class SearchUnavailableError extends Error {
  constructor(readonly retrievalTimings?: HybridSearchResult["timings"]) {
    super("No retrieval strategy is currently available");
    this.name = "SearchUnavailableError";
  }
}

export class MongoSearchService implements SearchService {
  constructor(
    private readonly resumeRepository: Pick<
      MongoResumeRepository,
      "searchBm25" | "searchVector"
    > = new MongoResumeRepository(),
    private readonly embeddingService: Pick<
      EmbeddingService,
      "generateQueryEmbedding"
    > = new EmbeddingService(),
    private readonly llmService: Pick<
      LLMService,
      "rerankCandidates" | "summarizeCandidateFit" | "summarizeCandidateFits"
    > = new GroqLLMService(),
  ) {}

  async bm25Search(
    query: string,
    filters: SearchFilters,
    topK: number,
  ): Promise<SearchCandidate[]> {
    const hits = await this.resumeRepository.searchBm25(query, filters, topK);
    const queryTerms =
      query.toLocaleLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [];

    return hits.map((hit) => {
      const skills = hit.skills ?? [];
      return {
        resumeId: hit._id.toHexString(),
        name: hit.name,
        role: hit.role,
        company: hit.company,
        ...(hit.totalExperience === undefined
          ? {}
          : { totalExperience: hit.totalExperience }),
        skills,
        ...(hit.snippet === undefined ? {} : { snippet: hit.snippet }),
        matchedSkills: skills.filter((skill) => {
          const normalizedSkill = skill.toLocaleLowerCase();
          return (
            queryTerms.some((term) => normalizedSkill.includes(term)) ||
            query.toLocaleLowerCase().includes(normalizedSkill)
          );
        }),
        bm25Score: hit.bm25Score,
        sources: ["bm25"],
      };
    });
  }

  async vectorSearch(
    query: string,
    filters: SearchFilters,
    topK: number,
    exactRescore = false,
  ): Promise<SearchCandidate[]> {
    const queryVector =
      await this.embeddingService.generateQueryEmbedding(query);
    return this.vectorSearchByEmbedding(
      queryVector,
      filters,
      topK,
      exactRescore,
    );
  }

  async vectorSearchByEmbedding(
    queryVector: number[],
    filters: SearchFilters,
    topK: number,
    exactRescore = false,
  ): Promise<SearchCandidate[]> {
    const hits = await this.resumeRepository.searchVector(
      queryVector,
      topK,
      filters,
      exactRescore,
    );
    const candidates: SearchCandidate[] = hits.map((hit) => ({
      resumeId: hit._id.toHexString(),
      name: hit.name,
      role: hit.role,
      company: hit.company,
      ...(hit.totalExperience === undefined
        ? {}
        : { totalExperience: hit.totalExperience }),
      skills: hit.skills ?? [],
      ...(hit.snippet === undefined ? {} : { snippet: hit.snippet }),
      vectorScore:
        exactRescore && hit.embedding
          ? (exactCosineScore(queryVector, hit.embedding) ?? hit.vectorScore)
          : hit.vectorScore,
      sources: ["vector"],
    }));
    if (exactRescore)
      candidates.sort(
        (left, right) => (right.vectorScore ?? 0) - (left.vectorScore ?? 0),
      );
    return candidates;
  }

  async hybridSearch(
    query: string,
    filters: SearchFilters,
    topK: number,
  ): Promise<HybridSearchResult> {
    return this.retrieveHybridSearch(query, filters, topK, topK);
  }

  private async retrieveHybridSearch(
    query: string,
    filters: SearchFilters,
    bm25TopK: number,
    vectorTopK: number,
    exactVectorRescore = false,
  ): Promise<HybridSearchResult> {
    const bm25StartedAt = performance.now();
    const bm25Promise = this.bm25Search(query, filters, bm25TopK).then(
      (bm25) => ({
        bm25,
        bm25Ms: elapsedMs(bm25StartedAt),
      }),
    );

    const embeddingStartedAt = performance.now();
    const vectorPromise = this.embeddingService
      .generateQueryEmbedding(query)
      .then(async (queryVector) => {
        const embeddingMs = elapsedMs(embeddingStartedAt);
        const vectorStartedAt = performance.now();
        const vector = await this.vectorSearchByEmbedding(
          queryVector,
          filters,
          vectorTopK,
          exactVectorRescore,
        );
        return { vector, embeddingMs, vectorMs: elapsedMs(vectorStartedAt) };
      });

    const [bm25Result, vectorResult] = await Promise.all([
      bm25Promise,
      vectorPromise,
    ]);
    return {
      bm25: bm25Result.bm25,
      vector: vectorResult.vector,
      timings: {
        bm25Ms: bm25Result.bm25Ms,
        embeddingMs: vectorResult.embeddingMs,
        vectorMs: vectorResult.vectorMs,
      },
    };
  }

  async endToEndSearch(
    query: string,
    filters: SearchFilters,
    options: EndToEndSearchOptions = {},
    requestId?: string,
  ): Promise<EndToEndSearchResult> {
    const startedAt = performance.now();
    const bm25TopK = options.bm25TopK ?? 20;
    const vectorTopK = options.vectorTopK ?? 20;
    const rerankTopN = options.rerankTopN ?? 10;
    const finalTopK = options.finalTopK ?? 5;
    if (
      !query.trim() ||
      !Number.isInteger(bm25TopK) ||
      bm25TopK < 1 ||
      bm25TopK > 100 ||
      !Number.isInteger(vectorTopK) ||
      vectorTopK < 1 ||
      vectorTopK > 100 ||
      !Number.isInteger(rerankTopN) ||
      rerankTopN < 1 ||
      rerankTopN > 50 ||
      !Number.isInteger(finalTopK) ||
      finalTopK < 1 ||
      finalTopK > 100 ||
      (options.exactVectorRescore !== undefined &&
        typeof options.exactVectorRescore !== "boolean") ||
      (options.summaryStyle !== undefined &&
        options.summaryStyle !== "short" &&
        options.summaryStyle !== "detailed") ||
      (options.summaryMaxTokens !== undefined &&
        (!Number.isInteger(options.summaryMaxTokens) ||
          options.summaryMaxTokens < 1 ||
          options.summaryMaxTokens > 1000))
    ) {
      throw new Error("Invalid end-to-end search options");
    }

    const retrieval = await this.retrieveWithFallback(
      query,
      filters,
      bm25TopK,
      vectorTopK,
      options.exactVectorRescore ?? false,
    );
    const hybrid = retrieval.hybrid;
    const candidates = deduplicateCandidates([
      hybrid.bm25,
      hybrid.vector,
    ]).slice(0, rerankTopN);
    let degraded = retrieval.degraded;
    const warnings = [...retrieval.warnings];
    let rerankMs = 0;
    let rankedCandidates: EndToEndSearchResult["results"];
    if (candidates.length === 0) {
      rankedCandidates = [];
    } else {
      const rerankStartedAt = performance.now();
      try {
        const reranked = await this.llmService.rerankCandidates(
          query,
          candidates,
          rerankTopN,
          Math.min(finalTopK, candidates.length),
        );
        if (reranked.length === 0)
          throw new Error("Reranker returned no candidates");
        const candidatesById = new Map(
          candidates.map((candidate) => [candidate.resumeId, candidate]),
        );
        rankedCandidates = reranked.slice(0, finalTopK).map((ranked) => {
          const candidate = candidatesById.get(ranked.resumeId);
          if (!candidate)
            throw new Error(
              "Reranker returned a candidate outside the supplied pool",
            );
          return {
            ...candidate,
            rank: ranked.rank,
            ...(ranked.relevanceScore === undefined
              ? {}
              : { relevanceScore: ranked.relevanceScore }),
            ...(ranked.reason === undefined ? {} : { reason: ranked.reason }),
          };
        });
      } catch (error) {
        logLlmFailure("Candidate reranking", error, requestId);
        degraded = true;
        warnings.push("LLM_RERANK_FAILED");
        rankedCandidates = deduplicateCandidates([hybrid.bm25, hybrid.vector])
          .slice(0, finalTopK)
          .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
      }
      rerankMs = elapsedMs(rerankStartedAt);
    }

    let results = rankedCandidates;
    let summarizeMs = 0;
    if (options.summarize) {
      const summarizeStartedAt = performance.now();
      const summaries: Array<
        | { candidate: EndToEndSearchResult["results"][number]; failed: false }
        | {
            candidate: EndToEndSearchResult["results"][number];
            failed: true;
            error: unknown;
          }
      > = [];
      const summaryOptions = {
        style: options.summaryStyle ?? "short",
        maxTokens: options.summaryMaxTokens ?? 150,
      };
      const summarizeBatch = this.llmService.summarizeCandidateFits;
      for (let start = 0; start < rankedCandidates.length; start += 5) {
        const batch = rankedCandidates.slice(start, start + 5);
        if (summarizeBatch) {
          try {
            const generated = await summarizeBatch.call(
              this.llmService,
              query,
              batch,
              summaryOptions,
            );
            const summariesById = new Map(
              generated.map(({ resumeId, summary }) => [resumeId, summary]),
            );
            if (
              summariesById.size !== batch.length ||
              batch.some((candidate) => !summariesById.get(candidate.resumeId))
            ) {
              throw new Error("Summary batch did not cover every candidate");
            }
            for (const candidate of batch) {
              const summary = summariesById.get(candidate.resumeId)!;
              summaries.push({
                candidate: { ...candidate, summary },
                failed: false,
              });
            }
          } catch (error) {
            for (const candidate of batch) {
              summaries.push({ candidate, failed: true, error });
            }
          }
        } else {
          for (const candidate of batch) {
            try {
              const summary = await this.llmService.summarizeCandidateFit(
                query,
                candidate,
                summaryOptions,
              );
              summaries.push({
                candidate: { ...candidate, summary },
                failed: false,
              });
            } catch (error) {
              summaries.push({ candidate, failed: true, error });
            }
          }
        }
      }
      results = summaries.map(({ candidate }) => candidate);
      const firstFailedSummary = summaries.find(({ failed }) => failed);
      if (firstFailedSummary?.failed) {
        logLlmFailure(
          "Candidate summarization",
          firstFailedSummary.error,
          requestId,
          summaries.filter(({ failed }) => failed).length,
        );
        degraded = true;
        warnings.push("SUMMARIZATION_FAILED");
      }
      summarizeMs = elapsedMs(summarizeStartedAt);
    }

    function logLlmFailure(
      operation: string,
      error: unknown,
      requestId?: string,
      failureCount?: number,
    ): void {
      const diagnostic: Record<string, string | number | undefined> = {
        requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
        ...(failureCount === undefined ? {} : { failureCount }),
      };
      if (error instanceof LLMOutputError) {
        diagnostic.errorCode = error.errorCode;
        if (error.finishReason) {
          diagnostic.finishReason = error.finishReason;
        }
      }
      if (error instanceof GroqApiError) {
        Object.assign(diagnostic, {
          ...(error.providerStatus === undefined
            ? {}
            : { providerStatus: error.providerStatus }),
          ...(error.providerCode === undefined
            ? {}
            : { providerCode: error.providerCode }),
          ...(error.providerType === undefined
            ? {}
            : { providerType: error.providerType }),
          ...(error.retryAfter === undefined
            ? {}
            : { retryAfter: error.retryAfter }),
          ...(error.tokenLimit === undefined
            ? {}
            : { tokenLimit: error.tokenLimit }),
          ...(error.remainingTokens === undefined
            ? {}
            : { remainingTokens: error.remainingTokens }),
          ...(error.tokenReset === undefined
            ? {}
            : { tokenReset: error.tokenReset }),
        });
      }
      console.error(`${operation} failed`, diagnostic);
    }

    return {
      query,
      results,
      degraded,
      warnings,
      ...(retrieval.vectorFallback ? { vectorFallback: true } : {}),
      ...(retrieval.bm25Fallback ? { bm25Fallback: true } : {}),
      timings: {
        ...hybrid.timings,
        rerankMs,
        summarizeMs,
        totalMs: elapsedMs(startedAt),
      },
    };
  }

  private async retrieveWithFallback(
    query: string,
    filters: SearchFilters,
    bm25TopK: number,
    vectorTopK: number,
    exactVectorRescore: boolean,
  ): Promise<{
    hybrid: HybridSearchResult;
    degraded: boolean;
    warnings: string[];
    vectorFallback: boolean;
    bm25Fallback: boolean;
  }> {
    const bm25StartedAt = performance.now();
    const bm25Promise = this.bm25Search(query, filters, bm25TopK).then(
      (bm25) => ({
        bm25,
        failed: false as const,
        bm25Ms: elapsedMs(bm25StartedAt),
      }),
      () => ({
        bm25: [] as SearchCandidate[],
        failed: true as const,
        bm25Ms: elapsedMs(bm25StartedAt),
      }),
    );

    const embeddingStartedAt = performance.now();
    const vectorPromise = this.embeddingService
      .generateQueryEmbedding(query)
      .then(
        async (queryVector) => {
          const embeddingMs = elapsedMs(embeddingStartedAt);
          const vectorStartedAt = performance.now();
          try {
            const vector = await this.vectorSearchByEmbedding(
              queryVector,
              filters,
              vectorTopK,
              exactVectorRescore,
            );
            return {
              vector,
              failed: false as const,
              embeddingMs,
              vectorMs: elapsedMs(vectorStartedAt),
            };
          } catch {
            return {
              vector: [] as SearchCandidate[],
              failed: true as const,
              embeddingMs,
              vectorMs: elapsedMs(vectorStartedAt),
            };
          }
        },
        () => ({
          vector: [] as SearchCandidate[],
          failed: true as const,
          embeddingMs: elapsedMs(embeddingStartedAt),
          vectorMs: 0,
        }),
      );

    const [bm25Result, vectorResult] = await Promise.all([
      bm25Promise,
      vectorPromise,
    ]);
    if (bm25Result.failed && vectorResult.failed) {
      throw new SearchUnavailableError({
        bm25Ms: bm25Result.bm25Ms,
        embeddingMs: vectorResult.embeddingMs,
        vectorMs: vectorResult.vectorMs,
      });
    }

    const warnings: string[] = [];
    if (bm25Result.failed) warnings.push("BM25_SEARCH_FAILED");
    if (vectorResult.failed) warnings.push("VECTOR_SEARCH_FAILED");
    return {
      hybrid: {
        bm25: bm25Result.bm25,
        vector: vectorResult.vector,
        timings: {
          bm25Ms: bm25Result.bm25Ms,
          embeddingMs: vectorResult.embeddingMs,
          vectorMs: vectorResult.vectorMs,
        },
      },
      degraded: warnings.length > 0,
      warnings,
      vectorFallback: vectorResult.failed,
      bm25Fallback: bm25Result.failed,
    };
  }
}

export function exactCosineScore(
  queryVector: number[],
  resumeVector: number[],
): number | undefined {
  if (
    queryVector.length === 0 ||
    queryVector.length !== resumeVector.length ||
    !queryVector.every(Number.isFinite) ||
    !resumeVector.every(Number.isFinite)
  )
    return undefined;

  let dotProduct = 0;
  let queryMagnitudeSquared = 0;
  let resumeMagnitudeSquared = 0;
  for (let index = 0; index < queryVector.length; index += 1) {
    const queryValue = queryVector[index]!;
    const resumeValue = resumeVector[index]!;
    dotProduct += queryValue * resumeValue;
    queryMagnitudeSquared += queryValue * queryValue;
    resumeMagnitudeSquared += resumeValue * resumeValue;
  }
  if (queryMagnitudeSquared === 0 || resumeMagnitudeSquared === 0)
    return undefined;

  const cosine = Math.max(
    -1,
    Math.min(
      1,
      dotProduct / Math.sqrt(queryMagnitudeSquared * resumeMagnitudeSquared),
    ),
  );
  return (1 + cosine) / 2;
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
