interface EducationSectionProps {
  education?: string
}

export function EducationSection({ education }: EducationSectionProps) {
  if (!education) return null

  return (
    <section
      className="candidate-profile-section"
      aria-labelledby="candidate-education-title"
    >
      <h3 id="candidate-education-title">Education</h3>
      <p className="candidate-education-copy">{education}</p>
    </section>
  )
}
