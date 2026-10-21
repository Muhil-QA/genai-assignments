import { apiConfig } from '@/config/api.config'

export function BrandAvatar() {
  return (
    <div className="sidebar-brand">
      <svg
        className="sidebar-brand-avatar"
        viewBox="0 0 44 44"
        role="img"
        aria-label={`${apiConfig.appName} logo`}
      >
        <rect x="1" y="1" width="42" height="42" rx="12" fill="#2563eb" />
        <text
          x="22"
          y="29"
          fill="white"
          fontFamily="Arial, sans-serif"
          fontSize="19"
          fontWeight="700"
          textAnchor="middle"
        >
          &lt;/&gt;
        </text>
      </svg>
      <span className="sidebar-brand-copy">
        <strong>{apiConfig.appName}</strong>
        <span className="sidebar-subtitle">Resume RAG workspace</span>
      </span>
    </div>
  )
}
