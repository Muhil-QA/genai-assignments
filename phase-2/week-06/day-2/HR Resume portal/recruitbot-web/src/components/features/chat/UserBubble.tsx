import { motion } from 'framer-motion'
import type { UserChatMessage } from '@/types/chat.types'

interface UserBubbleProps {
  message: UserChatMessage
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
})

export function UserBubble({ message }: UserBubbleProps) {
  return (
    <motion.article
      className="user-message"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="user-message-content">
        <div className="user-bubble">{message.content}</div>
        <time dateTime={new Date(message.createdAt).toISOString()}>
          {timeFormatter.format(message.createdAt)}
        </time>
      </div>
      <span className="message-avatar user-message-avatar" aria-hidden="true">
        Y
      </span>
    </motion.article>
  )
}
