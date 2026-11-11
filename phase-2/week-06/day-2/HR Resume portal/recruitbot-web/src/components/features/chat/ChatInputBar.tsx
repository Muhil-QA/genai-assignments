import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ArrowUp, CornerDownLeft } from 'lucide-react'
import { useSearchStore } from '@/lib/stores/search.store'
import { Textarea } from '@/components/ui/textarea'

interface ChatInputBarProps {
  onSubmit: (query: string) => void
}

const MAX_TEXTAREA_HEIGHT = 144

export function ChatInputBar({ onSubmit }: ChatInputBarProps) {
  const [query, setQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isSearching = useSearchStore((state) => state.isSearching)

  function updateQuery(value: string) {
    setQuery(value)
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }

  function submit() {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || isSearching) return

    onSubmit(trimmedQuery)
    setQuery('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.overflowY = 'hidden'
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat-composer">
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <Textarea
          ref={textareaRef}
          className="chat-input"
          aria-label="Describe the candidate you are looking for"
          placeholder="Describe the candidate you’re looking for..."
          rows={1}
          value={query}
          disabled={isSearching}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="chat-send-button"
          type="submit"
          aria-label="Send search query"
          disabled={!query.trim() || isSearching}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>
      <p className="chat-input-hint" aria-live="polite">
        <span>
          {query.trim()
            ? 'Press Enter to search'
            : 'Enter a role, skill, or experience to search'}
        </span>
        <span aria-hidden="true">·</span>
        <CornerDownLeft size={13} aria-hidden="true" />
        <span>Shift+Enter for new line</span>
      </p>
    </div>
  )
}
