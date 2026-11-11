import { Check, Search, Sparkles, TextSearch } from 'lucide-react'
import type { SearchMode } from '@/types/search.types'

interface SearchModeNavProps {
  activeMode: SearchMode
  onChange: (mode: SearchMode) => void
}

const searchModes: Array<{
  id: SearchMode
  label: string
  description: string
  icon: typeof Search
}> = [
  {
    id: 'vector',
    label: 'Vector Search',
    description: 'Find by meaning and context',
    icon: Search,
  },
  {
    id: 'bm25',
    label: 'BM25 Keyword',
    description: 'Match exact terms and skills',
    icon: TextSearch,
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Combine semantic and keyword',
    icon: Sparkles,
  },
]

export function SearchModeNav({ activeMode, onChange }: SearchModeNavProps) {
  return (
    <div className="search-mode-list" role="group" aria-label="Search mode">
      {searchModes.map(({ id, label, description, icon: Icon }) => {
        const isActive = activeMode === id

        return (
          <button
            className={`search-mode-card${isActive ? ' is-active' : ''}`}
            type="button"
            key={id}
            aria-pressed={isActive}
            onClick={() => onChange(id)}
          >
            <span className="search-mode-icon" aria-hidden="true">
              <Icon size={17} />
            </span>
            <span className="search-mode-copy">
              <strong>{label}</strong>
              <span>{description}</span>
            </span>
            {isActive && (
              <Check
                className="search-mode-check"
                size={16}
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
