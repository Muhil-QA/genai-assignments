import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/stores/chat.store'
import { useSearchStore } from '@/lib/stores/search.store'
import { BotBubble } from './BotBubble'
import { LoadingDots } from './LoadingDots'
import { SuggestionChips } from './SuggestionChips'
import { UserBubble } from './UserBubble'
import { WelcomeMessage } from './WelcomeMessage'

interface ChatMessagesProps {
  onSuggestionSelect: (query: string) => void
}

export function ChatMessages({ onSuggestionSelect }: ChatMessagesProps) {
  const messages = useChatStore((state) => state.messages)
  const isSearching = useSearchStore((state) => state.isSearching)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isSearching])

  return (
    <div className="chat-feed" aria-label="Conversation">
      <div
        className="chat-message-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <>
            <WelcomeMessage />
            <SuggestionChips onSelect={onSuggestionSelect} />
          </>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <BotBubble key={message.id}>{message.content}</BotBubble>
            ),
          )
        )}
        {isSearching && (
          <BotBubble>
            <LoadingDots />
          </BotBubble>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
