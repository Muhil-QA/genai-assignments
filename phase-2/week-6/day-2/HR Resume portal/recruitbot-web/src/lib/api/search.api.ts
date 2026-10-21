import apiClient from '@/lib/api/client'
import type {
  SearchRequest,
  SearchResponse,
  SearchResult,
} from '@/types/search.types'

interface ModeSearchApiResponse {
  query: string
  count: number
  results: Array<{
    resumeId: string
    name?: string
    role?: string
    score?: number
    vectorScore?: number
    matchedSkills?: string[]
  }>
}

interface EndToEndSearchApiResponse {
  query: string
  results: Array<{
    rank: number
    resumeId: string
    name?: string
    role?: string
    company?: string
    totalExperience?: number
    skills: string[]
    sources: Array<'bm25' | 'vector'>
    summary?: string
  }>
  degraded: boolean
  warnings: string[]
  timings: {
    totalMs: number
  }
}

export const searchApi = {
  async searchResumes({
    query,
    topK = 5,
    mode = 'vector',
  }: SearchRequest): Promise<SearchResponse> {
    const startedAt = performance.now()

    if (mode === 'bm25' || mode === 'vector') {
      const endpoint = mode === 'bm25' ? '/v1/search/bm25' : '/v1/search/vector'
      const { data } = await apiClient.post<ModeSearchApiResponse>(endpoint, {
        query,
        topK,
      })
      const results: SearchResult[] = data.results.map((candidate, index) => ({
        resumeId: candidate.resumeId,
        name: candidate.name,
        role: candidate.role,
        rank: index + 1,
        ...(mode === 'bm25'
          ? {
              ...(candidate.score === undefined
                ? {}
                : {
                    score: candidate.score,
                    scoreLabel: 'BM25 score' as const,
                  }),
              matchedSkills: candidate.matchedSkills ?? [],
              sources: ['bm25' as const],
            }
          : {
              ...(candidate.vectorScore === undefined
                ? {}
                : {
                    score: candidate.vectorScore,
                    scoreLabel: 'Similarity' as const,
                  }),
              sources: ['vector' as const],
            }),
      }))

      return {
        query: data.query,
        mode,
        results: deduplicateByResumeId(results),
        durationMs: Math.round(performance.now() - startedAt),
        degraded: false,
        warnings: [],
      }
    }

    const { data } = await apiClient.post<EndToEndSearchApiResponse>(
      '/v1/search',
      {
        query,
        options: { finalTopK: topK, summarize: true },
      },
    )

    return {
      query: data.query,
      mode,
      results: deduplicateByResumeId(
        data.results.map((candidate) => ({
          resumeId: candidate.resumeId,
          name: candidate.name,
          role: candidate.role,
          company: candidate.company,
          rank: candidate.rank,
          totalExperience: candidate.totalExperience,
          skills: candidate.skills,
          sources: candidate.sources,
          summary: candidate.summary,
        })),
      ),
      durationMs: data.timings.totalMs,
      degraded: data.degraded,
      warnings: data.warnings,
    }
  },
}

function deduplicateByResumeId(results: SearchResult[]): SearchResult[] {
  const uniqueResults = new Map<string, SearchResult>()
  for (const result of results) {
    if (!uniqueResults.has(result.resumeId)) {
      uniqueResults.set(result.resumeId, result)
    }
  }
  return [...uniqueResults.values()]
}
