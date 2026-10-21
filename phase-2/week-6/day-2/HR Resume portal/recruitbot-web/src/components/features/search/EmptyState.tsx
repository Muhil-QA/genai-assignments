import { UserSearch } from 'lucide-react'

interface EmptyStateProps {
  query: string
}

export function EmptyState({ query }: EmptyStateProps) {
  return (
    <div className="search-empty-state">
      <span aria-hidden="true">
        <UserSearch size={20} />
      </span>
      <h3>No candidates found</h3>
      <p>Try broadening or rephrasing “{query}”.</p>
    </div>
  )
}
