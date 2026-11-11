import { motion } from 'framer-motion'
import { RankBadge } from './RankBadge'
import { ScorePill } from './ScorePill'
import type { SearchMode, SearchResult } from '@/types/search.types'

const sourceLabels = {
  bm25: 'Keyword',
  vector: 'Semantic',
} as const

interface ResultCardProps {
  candidate: SearchResult
  index: number
  searchType: SearchMode
  onSelect: (id: string) => void
}

export function ResultCard({
  candidate,
  index,
  searchType,
  onSelect,
}: ResultCardProps) {
  const skills = candidate.matchedSkills?.length
    ? candidate.matchedSkills
    : (candidate.skills ?? [])
  const summary = candidate.summary?.trim()
  const snippet = candidate.snippet?.trim()

  return (
    <motion.article
      className="result-card"
      role="button"
      tabIndex={0}
      aria-label={`Open profile for ${candidate.name || 'candidate'}`}
      onClick={() => onSelect(candidate.resumeId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(candidate.resumeId)
        }
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.06 }}
    >
      <div className="result-card-header">
        <RankBadge rank={candidate.rank ?? index + 1} />
        <div className="result-card-identity">
          <h3>{candidate.name || 'Candidate'}</h3>
          <p>
            {[candidate.role, candidate.company].filter(Boolean).join(' · ') ||
              'Role details not provided'}
          </p>
        </div>
        {candidate.score !== undefined &&
          candidate.scoreLabel !== undefined && (
            <ScorePill
              score={candidate.score}
              label={candidate.scoreLabel}
              searchType={searchType}
            />
          )}
      </div>

      {(candidate.totalExperience !== undefined || skills.length > 0) && (
        <div className="result-card-details">
          {candidate.totalExperience !== undefined && (
            <span className="candidate-experience">
              {candidate.totalExperience} years experience
            </span>
          )}
          {skills.map((skill) => (
            <span className="candidate-skill" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      )}

      {candidate.sources && candidate.sources.length > 0 && (
        <div
          className="result-card-sources"
          aria-label={`Matched by ${candidate.sources.map((source) => sourceLabels[source]).join(' and ')} search`}
        >
          {candidate.sources.map((source) => (
            <span className="candidate-source" key={source}>
              {sourceLabels[source]} match
            </span>
          ))}
        </div>
      )}

      {summary ? (
        <div className="result-card-summary">
          <strong>Candidate fit summary</strong>
          <p>{summary}</p>
        </div>
      ) : snippet ? (
        <p className="result-card-preview">{snippet}</p>
      ) : null}
    </motion.article>
  )
}
