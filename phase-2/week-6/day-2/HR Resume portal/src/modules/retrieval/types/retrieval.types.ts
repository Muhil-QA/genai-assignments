import { ObjectId } from "mongodb";
import { ParsedResume } from "../../ingestion/types/ingestion.types";

export type SearchSource = "bm25" | "vector";

export interface StoredResume extends ParsedResume {
  _id: ObjectId;
  rawText: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimension?: number;
}

export interface SearchFilters {
  minYearsExperience?: number;
}

export interface SearchCandidate {
  resumeId: string;
  name?: string;
  role?: string;
  company?: string;
  totalExperience?: number;
  skills?: string[];
  matchedSkills?: string[];
  snippet?: string;
  bm25Score?: number;
  vectorScore?: number;
  sources: SearchSource[];
}

export interface Bm25ResumeHit {
  _id: ObjectId;
  name?: string;
  role?: string;
  company?: string;
  totalExperience?: number;
  skills?: string[];
  snippet?: string;
  bm25Score: number;
}

export interface VectorResumeHit {
  _id: ObjectId;
  name?: string;
  role?: string;
  company?: string;
  totalExperience?: number;
  skills?: string[];
  snippet?: string;
  embedding?: number[];
  vectorScore: number;
}

export interface RerankedCandidate {
  resumeId: string;
  rank: number;
  relevanceScore?: number;
  reason?: string;
}

export interface HybridSearchResult {
  bm25: SearchCandidate[];
  vector: SearchCandidate[];
  timings: {
    bm25Ms: number;
    embeddingMs: number;
    vectorMs: number;
  };
}

export interface EndToEndSearchOptions {
  bm25TopK?: number;
  vectorTopK?: number;
  rerankTopN?: number;
  finalTopK?: number;
  summarize?: boolean;
  summaryStyle?: "short" | "detailed";
  summaryMaxTokens?: number;
  exactVectorRescore?: boolean;
}

export interface EndToEndSearchCandidate extends SearchCandidate {
  rank: number;
  relevanceScore?: number;
  reason?: string;
  summary?: string;
}

export interface EndToEndSearchResult {
  query: string;
  results: EndToEndSearchCandidate[];
  degraded: boolean;
  warnings: string[];
  vectorFallback?: boolean;
  bm25Fallback?: boolean;
  timings: {
    embeddingMs: number;
    bm25Ms: number;
    vectorMs: number;
    rerankMs: number;
    summarizeMs: number;
    totalMs: number;
  };
}
