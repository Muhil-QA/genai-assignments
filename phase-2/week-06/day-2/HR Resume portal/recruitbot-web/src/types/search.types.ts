export type SearchMode = 'vector' | 'bm25' | 'hybrid'

export interface SearchRequest {
  query: string
  topK?: number
  mode?: SearchMode
}

export type SearchSource = 'bm25' | 'vector'

export interface SearchResult {
  resumeId: string
  name?: string
  role?: string
  company?: string
  score?: number
  scoreLabel?: 'BM25 score' | 'Similarity'
  rank?: number
  totalExperience?: number
  skills?: string[]
  matchedSkills?: string[]
  snippet?: string
  summary?: string
  sources?: SearchSource[]
}

export interface SearchResponse {
  query: string
  mode: SearchMode
  results: SearchResult[]
  durationMs: number
  degraded: boolean
  warnings: string[]
}
