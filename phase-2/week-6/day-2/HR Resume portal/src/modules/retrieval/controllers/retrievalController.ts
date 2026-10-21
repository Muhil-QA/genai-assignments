import { Request, Response } from "express";
import { env } from "../../../config/env";
import { sendApiError } from "../../../middleware/errorHandler";
import { EmbeddingService } from "../../ingestion/services/EmbeddingService";
import {
  CandidateSummaryOptions,
  GroqApiError,
  GroqLLMService,
  LLMService,
} from "../services/LLMService";
import {
  MongoSearchService,
  SearchService,
  SearchUnavailableError,
} from "../services/SearchService";
import { RetrievalValidationService } from "../services/RetrievalValidationService";
import {
  EndToEndSearchOptions,
  SearchCandidate,
} from "../types/retrieval.types";
import { MAX_CANDIDATE_SNIPPET_CHARS } from "../utils/deduplicate";
import { parseSearchFilters } from "../utils/requestValidation";

type ReadinessValidator = Pick<RetrievalValidationService, "getReadiness">;
type QueryEmbedder = Pick<EmbeddingService, "generateQueryEmbedding">;
type Bm25Searcher = Pick<SearchService, "bm25Search">;
type VectorSearcher = Pick<SearchService, "vectorSearchByEmbedding">;
type HybridSearcher = Pick<SearchService, "hybridSearch">;
type CandidateReranker = Pick<LLMService, "rerankCandidates">;
type CandidateSummarizer = Pick<LLMService, "summarizeCandidateFit">;
type EndToEndSearcher = Pick<SearchService, "endToEndSearch">;

export class RetrievalController {
  constructor(
    private readonly validationService: ReadinessValidator = new RetrievalValidationService(),
    private readonly embeddingService: QueryEmbedder = new EmbeddingService(),
    private readonly searchService: Bm25Searcher = new MongoSearchService(),
    private readonly vectorSearchService: VectorSearcher = new MongoSearchService(),
    private readonly hybridSearchService: HybridSearcher = new MongoSearchService(),
    private readonly llmService: CandidateReranker = new GroqLLMService(),
    private readonly candidateSummarizer: CandidateSummarizer = new GroqLLMService(),
    private readonly endToEndSearcher: EndToEndSearcher = new MongoSearchService(),
  ) {}

  getReadiness = async (_req: Request, res: Response): Promise<void> => {
    try {
      const readiness = await this.validationService.getReadiness();
      res.status(200).json(readiness);
    } catch {
      res.status(503).json({
        ready: false,
        reason: "Unable to verify resume readiness from MongoDB",
      });
    }
  };

  createQueryEmbedding = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    if (
      body.model !== env.mistralEmbedModel ||
      typeof body.input !== "string" ||
      !body.input.trim() ||
      body.input.length > 2000
    ) {
      sendApiError(res, "INVALID_REQUEST");
      return;
    }

    try {
      const embedding = await this.embeddingService.generateQueryEmbedding(
        body.input,
      );
      res.status(200).json({
        embedding,
        model: env.mistralEmbedModel,
        dimension: embedding.length,
      });
    } catch {
      sendApiError(res, "EMBEDDING_FAILED");
    }
  };

  bm25Search = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = body.topK ?? 20;
    const filters = parseSearchFilters(body.filters);
    if (
      !query ||
      query.length > 2000 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 100 ||
      filters === null
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    try {
      const results = await this.searchService.bm25Search(query, filters, topK);
      res.status(200).json({
        mode: "bm25",
        query,
        count: results.length,
        results: results.map((candidate) => ({
          resumeId: candidate.resumeId,
          name: candidate.name,
          role: candidate.role,
          score: candidate.bm25Score,
          matchedSkills: candidate.matchedSkills ?? [],
        })),
      });
    } catch {
      sendApiError(res, "SEARCH_FAILED");
    }
  };

  vectorSearch = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = body.topK ?? 20;
    const exactRescore = body.exactRescore ?? false;
    if (
      !query ||
      query.length > 2000 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 100 ||
      typeof exactRescore !== "boolean"
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    let queryVector: number[];
    try {
      queryVector = await this.embeddingService.generateQueryEmbedding(query);
    } catch {
      sendApiError(res, "EMBEDDING_FAILED");
      return;
    }

    try {
      const results = await this.vectorSearchService.vectorSearchByEmbedding(
        queryVector,
        {},
        topK,
        exactRescore,
      );
      res.status(200).json({
        mode: "vector",
        count: results.length,
        results: results.map((candidate) => ({
          resumeId: candidate.resumeId,
          name: candidate.name,
          role: candidate.role,
          vectorScore: candidate.vectorScore,
        })),
      });
    } catch {
      sendApiError(res, "SEARCH_FAILED");
    }
  };

  hybridSearch = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = body.topK ?? 20;
    const filters = parseSearchFilters(body.filters);
    if (
      !query ||
      query.length > 2000 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 100 ||
      filters === null
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    try {
      const result = await this.hybridSearchService.hybridSearch(
        query,
        filters,
        topK,
      );
      res.status(200).json({
        mode: "hybrid-debug",
        bm25: result.bm25.map((candidate) => ({
          resumeId: candidate.resumeId,
          name: candidate.name,
          score: candidate.bm25Score,
        })),
        vector: result.vector.map((candidate) => ({
          resumeId: candidate.resumeId,
          name: candidate.name,
          score: candidate.vectorScore,
        })),
        timings: result.timings,
      });
    } catch {
      sendApiError(res, "SEARCH_FAILED");
    }
  };

  rerankCandidates = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = body.topK ?? 10;
    if (
      !query ||
      query.length > 2000 ||
      !Array.isArray(body.candidates) ||
      body.candidates.length < 1 ||
      body.candidates.length > 50 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    const candidates: SearchCandidate[] = [];
    for (const input of body.candidates as unknown[]) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        sendApiError(res, "INVALID_SEARCH_QUERY");
        return;
      }
      const item = input as Record<string, unknown>;
      if (
        typeof item.resumeId !== "string" ||
        !/^[a-f\d]{24}$/i.test(item.resumeId) ||
        typeof item.snippet !== "string" ||
        !item.snippet.trim()
      ) {
        sendApiError(res, "INVALID_SEARCH_QUERY");
        return;
      }
      candidates.push({
        resumeId: item.resumeId,
        snippet: item.snippet.slice(0, MAX_CANDIDATE_SNIPPET_CHARS),
        sources: [],
      });
    }

    try {
      const results = await this.llmService.rerankCandidates(
        query,
        candidates,
        topK,
      );
      res.status(200).json({ results, model: env.groqModel });
    } catch (error) {
      logGroqFailure("Candidate reranking", error, res);
      sendApiError(res, "RERANK_FAILED");
    }
  };

  summarizeCandidate = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const candidateInput = body.candidate;
    const style = body.style ?? "short";
    const maxTokens = body.maxTokens ?? 150;
    if (
      !query ||
      query.length > 2000 ||
      !candidateInput ||
      typeof candidateInput !== "object" ||
      Array.isArray(candidateInput) ||
      (style !== "short" && style !== "detailed") ||
      !Number.isInteger(maxTokens) ||
      maxTokens < 1 ||
      maxTokens > 1000
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    const input = candidateInput as Record<string, unknown>;
    if (
      typeof input.resumeId !== "string" ||
      !input.resumeId.trim() ||
      input.resumeId.length > 128 ||
      typeof input.snippet !== "string" ||
      !input.snippet.trim()
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }
    const candidate: SearchCandidate = {
      resumeId: input.resumeId,
      snippet: input.snippet.slice(0, MAX_CANDIDATE_SNIPPET_CHARS),
      sources: [],
    };
    const options: CandidateSummaryOptions = { style, maxTokens };

    try {
      const summary = await this.candidateSummarizer.summarizeCandidateFit(
        query,
        candidate,
        options,
      );
      res.status(200).json({ resumeId: candidate.resumeId, summary });
    } catch (error) {
      logGroqFailure("Candidate summarization", error, res);
      sendApiError(res, "SUMMARY_FAILED");
    }
  };

  search = async (req: Request, res: Response): Promise<void> => {
    const searchStartedAt = performance.now();
    const body = req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      sendApiError(res, "INVALID_SEARCH_QUERY", "Search query is required");
      return;
    }
    const filters = parseSearchFilters(body.filters);
    const optionsAreValid =
      body.options === undefined ||
      (typeof body.options === "object" &&
        body.options !== null &&
        !Array.isArray(body.options));
    const inputOptions = optionsAreValid
      ? ((body.options ?? {}) as Record<string, unknown>)
      : {};
    const optionLimits = [
      ["bm25TopK", 1, 100],
      ["vectorTopK", 1, 100],
      ["rerankTopN", 1, 50],
      ["finalTopK", 1, 100],
      ["summaryMaxTokens", 1, 1000],
    ] as const;
    const invalidLimit = optionLimits.some(([key, minimum, maximum]) => {
      const value = inputOptions[key];
      return (
        value !== undefined &&
        (!Number.isInteger(value) ||
          (value as number) < minimum ||
          (value as number) > maximum)
      );
    });
    const allowedOptions = new Set([
      "bm25TopK",
      "vectorTopK",
      "rerankTopN",
      "finalTopK",
      "summarize",
      "summaryStyle",
      "summaryMaxTokens",
      "exactVectorRescore",
    ]);
    if (
      !query ||
      query.length > 2000 ||
      filters === null ||
      !optionsAreValid ||
      Object.keys(inputOptions).some((key) => !allowedOptions.has(key)) ||
      invalidLimit ||
      (inputOptions.summarize !== undefined &&
        typeof inputOptions.summarize !== "boolean") ||
      (inputOptions.exactVectorRescore !== undefined &&
        typeof inputOptions.exactVectorRescore !== "boolean") ||
      (inputOptions.summaryStyle !== undefined &&
        inputOptions.summaryStyle !== "short" &&
        inputOptions.summaryStyle !== "detailed")
    ) {
      sendApiError(res, "INVALID_SEARCH_QUERY");
      return;
    }

    const options = inputOptions as EndToEndSearchOptions;
    try {
      const result = await this.endToEndSearcher.endToEndSearch(
        query,
        filters,
        options,
        typeof res.locals.requestId === "string"
          ? res.locals.requestId
          : undefined,
      );
      res.locals.retrievalTimings = result.timings;
      res.locals.retrievalDegraded = result.degraded;
      res.locals.retrievalWarnings = result.warnings;
      res.status(200).json({
        query: result.query,
        results: result.results.map((candidate) => ({
          rank: candidate.rank,
          resumeId: candidate.resumeId,
          name: candidate.name,
          role: candidate.role,
          company: candidate.company,
          ...(candidate.totalExperience === undefined
            ? {}
            : { totalExperience: candidate.totalExperience }),
          skills: candidate.skills ?? [],
          sources: candidate.sources,
          ...(candidate.summary === undefined
            ? {}
            : { summary: candidate.summary }),
        })),
        degraded: result.degraded,
        warnings: result.warnings,
        ...(result.vectorFallback ? { vectorFallback: true } : {}),
        ...(result.bm25Fallback ? { bm25Fallback: true } : {}),
        timings: result.timings,
      });
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        res.locals.retrievalDegraded = true;
        res.locals.retrievalWarnings = [
          "BM25_SEARCH_FAILED",
          "VECTOR_SEARCH_FAILED",
        ];
        if (error.retrievalTimings) {
          res.locals.retrievalTimings = {
            ...error.retrievalTimings,
            rerankMs: 0,
            summarizeMs: 0,
            totalMs: Math.round(performance.now() - searchStartedAt),
          };
        }
      }
      sendApiError(
        res,
        error instanceof SearchUnavailableError
          ? "SEARCH_UNAVAILABLE"
          : "SEARCH_FAILED",
      );
    }
  };
}

function logGroqFailure(
  operation: string,
  error: unknown,
  res: Response,
): void {
  const diagnostic: Record<string, string | number | undefined> = {
    requestId:
      typeof res.locals.requestId === "string"
        ? res.locals.requestId
        : undefined,
    errorType: error instanceof Error ? error.name : "UnknownError",
  };
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
