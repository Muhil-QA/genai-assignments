import type { SearchMode } from '@/types/search.types'

interface ResultSummaryProps {
  count: number
  duration: number
  searchType: SearchMode
}

const modeLabels: Record<SearchMode, string> = {
  vector: 'Vector Search',
  bm25: 'BM25 Keyword',
  hybrid: 'Hybrid Search',
}

function formatDuration(duration: number) {
  return duration < 1000
    ? `${duration} ms`
    : `${(duration / 1000).toFixed(1)} s`
}

export function ResultSummary({
  count,
  duration,
  searchType,
}: ResultSummaryProps) {
  return (
    <div className="result-summary">
      <p>
        Found <strong>{count}</strong>{' '}
        {count === 1 ? 'candidate' : 'candidates'}
      </p>
      <div className="result-summary-meta">
        <span className={`chat-mode-badge chat-mode-${searchType}`}>
          {modeLabels[searchType]}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}
