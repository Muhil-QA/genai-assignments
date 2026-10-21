import { NavLink } from 'react-router-dom'
import { FileUp, Search } from 'lucide-react'
import { BrandAvatar } from '@/components/common/BrandAvatar'
import { ClearChatButton } from '@/components/features/sidebar/ClearChatButton'
import { HybridWeightPanel } from '@/components/features/sidebar/HybridWeightPanel'
import { ResultsLimitSelect } from '@/components/features/sidebar/ResultsLimitSelect'
import { SearchModeNav } from '@/components/features/sidebar/SearchModeNav'
import { apiConfig } from '@/config/api.config'
import { useSearchStore } from '@/lib/stores/search.store'

export function Sidebar() {
  const searchType = useSearchStore((state) => state.searchType)
  const setSearchType = useSearchStore((state) => state.setSearchType)

  return (
    <aside className="app-sidebar" aria-label="Search controls">
      <NavLink
        className="sidebar-brand-link"
        to="/"
        end
        aria-label={`${apiConfig.appName} home`}
      >
        <BrandAvatar />
      </NavLink>

      <div className="sidebar-section-label">SEARCH MODE</div>
      <SearchModeNav activeMode={searchType} onChange={setSearchType} />
      <HybridWeightPanel isVisible={searchType === 'hybrid'} />

      <div className="sidebar-section-label results-section-label">
        RESULTS LIMIT
      </div>
      <ResultsLimitSelect />
      <ClearChatButton />

      <nav className="sidebar-feature-nav" aria-label="Workspace navigation">
        <NavLink
          className={({ isActive }) =>
            `sidebar-feature-link${isActive ? ' is-active' : ''}`
          }
          to="/"
          end
          aria-label="Candidate search"
        >
          <Search size={17} aria-hidden="true" />
          <span>Candidate search</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            `sidebar-feature-link${isActive ? ' is-active' : ''}`
          }
          to="/ingestion"
          aria-label="Resume ingestion"
        >
          <FileUp size={17} aria-hidden="true" />
          <span>Resume ingestion</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <span>{apiConfig.appName} v2.0</span>
      </div>
    </aside>
  )
}
