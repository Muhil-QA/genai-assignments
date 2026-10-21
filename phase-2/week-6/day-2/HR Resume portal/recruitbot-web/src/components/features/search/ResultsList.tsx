import { EmptyState } from './EmptyState'
import { ResultCard } from './ResultCard'
import { ResultSummary } from './ResultSummary'
import type { SearchMode, SearchResult } from '@/types/search.types'

interface ResultsListProps {
  results: SearchResult[]
  searchType: SearchMode
  duration: number
  query: string
  degraded: boolean
  warnings: string[]
  onCandidateSelect: (id: string) => void
}

export function ResultsList({
  results,
  searchType,
  duration,
  query,
  degraded,
  warnings,
  onCandidateSelect,
}: ResultsListProps) {
  return (
    <section className="results-list" aria-label="Candidate search results">
      <ResultSummary
        count={results.length}
        duration={duration}
        searchType={searchType}
      />
      {degraded && (
        <div className="results-degraded" role="status">
          <p>
            Some search steps were unavailable; these results may be incomplete.
          </p>
          {warnings.length > 0 && (
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>
                  {warningMessages[warning] ??
                    'An optional search step was unavailable.'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {searchType === 'hybrid' && (
        <p className="results-mode-note">
          Hybrid ranking uses the backend defaults; the current search endpoint
          does not accept custom weight values.
        </p>
      )}
      {results.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div className="result-card-list">
          {results.map((candidate, index) => (
            <ResultCard
              key={candidate.resumeId}
              candidate={candidate}
              index={index}
              searchType={searchType}
              onSelect={onCandidateSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

const warningMessages: Record<string, string> = {
  BM25_SEARCH_FAILED:
    'Keyword search was unavailable; results may not include keyword matches.',
  VECTOR_SEARCH_FAILED:
    'Semantic search was unavailable; results may not include semantically matched candidates.',
  LLM_RERANK_FAILED:
    'AI re-ranking was unavailable; candidates are shown in fallback retrieval order.',
  SUMMARIZATION_FAILED:
    'Summaries were unavailable for one or more candidates.',
}
