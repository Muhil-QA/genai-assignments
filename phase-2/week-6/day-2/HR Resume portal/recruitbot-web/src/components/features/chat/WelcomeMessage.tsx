import { Search, Sparkles, TextSearch } from 'lucide-react'
import { BotBubble } from './BotBubble'
import { apiConfig } from '@/config/api.config'

const searchModes = [
  {
    icon: Search,
    name: 'Vector search',
    description: 'Find candidates by meaning and context.',
  },
  {
    icon: TextSearch,
    name: 'BM25 keyword',
    description: 'Match skills and phrases from your query.',
  },
  {
    icon: Sparkles,
    name: 'Hybrid search',
    description: 'Combine semantic and keyword matching.',
  },
]

export function WelcomeMessage() {
  return (
    <BotBubble className="welcome-message">
      <p className="welcome-eyebrow">RECRUITER WORKSPACE</p>
      <h1>Welcome to {apiConfig.appName}.</h1>
      <p className="welcome-copy">
        Describe the role or skills you’re looking for. Choose a search mode
        from the sidebar to explore your candidate database.
      </p>
      <div className="welcome-mode-list">
        {searchModes.map(({ icon: Icon, name, description }) => (
          <div className="welcome-mode" key={name}>
            <span aria-hidden="true">
              <Icon size={16} />
            </span>
            <div>
              <strong>{name}</strong>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
    </BotBubble>
  )
}
