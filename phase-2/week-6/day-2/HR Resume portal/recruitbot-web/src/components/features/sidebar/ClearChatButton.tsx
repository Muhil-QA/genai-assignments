import { Trash2 } from 'lucide-react'
import { useChatStore } from '@/lib/stores/chat.store'

export function ClearChatButton() {
  const clearMessages = useChatStore((state) => state.clearMessages)

  return (
    <button className="clear-chat-button" type="button" onClick={clearMessages}>
      <Trash2 size={16} aria-hidden="true" />
      <span>Clear chat</span>
    </button>
  )
}
