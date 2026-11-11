import { Cloud, Search, Sparkles, Terminal } from 'lucide-react'

const suggestions = [
  {
    icon: Search,
    label: 'Selenium QA · 3 yrs',
    query: 'Selenium automation engineer 3 years',
  },
  {
    icon: Terminal,
    label: 'Python ML developer',
    query: 'Python developer with machine learning',
  },
  {
    icon: Cloud,
    label: 'Java + AWS backend',
    query: 'Java backend developer AWS cloud',
  },
  {
    icon: Sparkles,
    label: 'Lead QA · Cypress',
    query: 'Lead QA engineer with Cypress and CI/CD',
  },
]

interface SuggestionChipsProps {
  onSelect: (query: string) => void
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <section className="suggestions" aria-label="Suggested searches">
      <p>Try a sample search</p>
      <div className="suggestion-list">
        {suggestions.map(({ icon: Icon, label, query }) => (
          <button
            className="suggestion-chip"
            type="button"
            key={query}
            onClick={() => onSelect(query)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
