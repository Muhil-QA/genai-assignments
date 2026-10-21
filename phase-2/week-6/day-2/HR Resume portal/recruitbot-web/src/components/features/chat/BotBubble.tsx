import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface BotBubbleProps {
  children: ReactNode
  className?: string
}

export function BotBubble({ children, className = '' }: BotBubbleProps) {
  return (
    <motion.article
      className={`bot-message${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <span className="message-avatar bot-message-avatar" aria-hidden="true">
        <span>&lt;/&gt;</span>
      </span>
      <div className="bot-bubble">{children}</div>
    </motion.article>
  )
}
