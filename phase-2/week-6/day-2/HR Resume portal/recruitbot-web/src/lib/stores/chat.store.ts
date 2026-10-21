import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { ChatMessage } from '@/types/chat.types'

interface ChatState {
  messages: ChatMessage[]
  addMessage: (message: ChatMessage) => void
  addUserMessage: (text: string) => string
  addBotMessage: (content: ReactNode) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  addUserMessage: (content) => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: 'user', content, createdAt: Date.now() },
      ],
    }))
    return id
  },
  addBotMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),
}))
