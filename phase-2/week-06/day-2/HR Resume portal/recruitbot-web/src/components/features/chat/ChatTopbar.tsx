import { useSearchStore } from '@/lib/stores/search.store'
import { apiConfig } from '@/config/api.config'
import type { SearchMode } from '@/types/search.types'

const modeDetails: Record<SearchMode, { label: string; description: string }> =
  {
    vector: {
      label: 'Vector Search',
      description: 'Semantic similarity',
    },
    bm25: {
      label: 'BM25 Keyword',
      description: 'Exact skills and terms',
    },
    hybrid: {
      label: 'Hybrid Search',
      description: 'Semantic + keyword',
    },
  }

export function ChatTopbar() {
  const searchType = useSearchStore((state) => state.searchType)
  const mode = modeDetails[searchType]

  return (
    <header className="chat-topbar">
      <div className="chat-topbar-brand">
        <span className="chat-topbar-avatar" aria-hidden="true">
          &lt;/&gt;
        </span>
        <span className="chat-topbar-copy">
          <strong>{apiConfig.appName}</strong>
          <span>
            {mode.label} <span aria-hidden="true">·</span> {mode.description}
          </span>
        </span>
      </div>
      <span className={`chat-mode-badge chat-mode-${searchType}`}>
        {mode.label}
      </span>
    </header>
  )
}
