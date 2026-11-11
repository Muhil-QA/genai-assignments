import { Mail, MapPin, Phone } from 'lucide-react'
import type { CandidateProfile } from '@/types/candidate.types'

interface ContactSectionProps {
  candidate: CandidateProfile
}

export function ContactSection({ candidate }: ContactSectionProps) {
  const entries = [
    candidate.email
      ? {
          icon: Mail,
          label: 'Email',
          value: candidate.email,
          href: `mailto:${candidate.email}`,
        }
      : null,
    candidate.phone
      ? {
          icon: Phone,
          label: 'Phone',
          value: candidate.phone,
          href: `tel:${candidate.phone}`,
        }
      : null,
    candidate.location
      ? { icon: MapPin, label: 'Location', value: candidate.location }
      : null,
  ].filter((entry) => entry !== null)

  if (entries.length === 0) return null

  return (
    <section
      className="candidate-profile-section"
      aria-labelledby="candidate-contact-title"
    >
      <h3 id="candidate-contact-title">Contact</h3>
      <ul className="candidate-contact-list">
        {entries.map(({ icon: Icon, label, value, href }) => (
          <li key={label}>
            <Icon size={16} aria-hidden="true" />
            <span className="candidate-contact-label">{label}</span>
            {href ? <a href={href}>{value}</a> : <span>{value}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
