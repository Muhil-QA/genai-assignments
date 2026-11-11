import type { CandidateProfile } from '@/types/candidate.types'

interface SkillsSectionProps {
  skills: CandidateProfile['skills']
}

export function SkillsSection({ skills }: SkillsSectionProps) {
  if (skills.length === 0) return null

  return (
    <section
      className="candidate-profile-section"
      aria-labelledby="candidate-skills-title"
    >
      <h3 id="candidate-skills-title">Skills</h3>
      <ul className="candidate-profile-skills">
        {skills.map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>
    </section>
  )
}
