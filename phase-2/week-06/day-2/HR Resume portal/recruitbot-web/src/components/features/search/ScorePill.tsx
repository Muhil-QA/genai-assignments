import type { SearchMode } from '@/types/search.types'

interface ScorePillProps {
  score: number
  searchType: SearchMode
  label: 'BM25 score' | 'Similarity'
}

function formatScore(score: number) {
  return score.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })
}

export function ScorePill({ score, searchType, label }: ScorePillProps) {
  return (
    <span className={`score-pill score-${searchType}`}>
      <strong>{formatScore(score)}</strong>
      <span>{label}</span>
    </span>
  )
}
