import type { ReactNode } from 'react'

interface ChatMessageBase {
  id: string
  createdAt: number
}

export interface UserChatMessage extends ChatMessageBase {
  role: 'user'
  content: string
}

export interface AssistantChatMessage extends ChatMessageBase {
  role: 'assistant'
  content: ReactNode
}

export type ChatMessage = UserChatMessage | AssistantChatMessage
