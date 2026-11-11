import type { CandidateProfile } from '@/types/candidate.types'

interface ExperienceSectionProps {
  candidate: CandidateProfile
}

export function ExperienceSection({ candidate }: ExperienceSectionProps) {
  const jobTitles = candidate.jobTitles ?? []
  const hasExperience =
    candidate.totalExperience !== undefined ||
    candidate.relevantExperience !== undefined ||
    Boolean(candidate.experienceSummary) ||
    jobTitles.length > 0

  if (!hasExperience) return null

  return (
    <section
      className="candidate-profile-section"
      aria-labelledby="candidate-experience-title"
    >
      <h3 id="candidate-experience-title">Experience</h3>
      <div className="candidate-experience-content">
        {(candidate.totalExperience !== undefined ||
          candidate.relevantExperience !== undefined) && (
          <p className="candidate-experience-years">
            {candidate.totalExperience !== undefined &&
              `${candidate.totalExperience} years total experience`}
            {candidate.totalExperience !== undefined &&
              candidate.relevantExperience !== undefined &&
              ' · '}
            {candidate.relevantExperience !== undefined &&
              `${candidate.relevantExperience} years relevant experience`}
          </p>
        )}
        {jobTitles.length > 0 && (
          <ul className="candidate-job-titles">
            {jobTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        )}
        {candidate.experienceSummary && (
          <p className="candidate-experience-summary">
            {candidate.experienceSummary}
          </p>
        )}
      </div>
    </section>
  )
}
