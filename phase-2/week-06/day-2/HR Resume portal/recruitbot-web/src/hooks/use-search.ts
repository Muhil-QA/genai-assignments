import { createElement, useCallback } from 'react'
import { useChatStore } from '@/lib/stores/chat.store'
import { useSearchStore } from '@/lib/stores/search.store'
import { searchApi } from '@/lib/api/search.api'
import { ResultsList } from '@/components/features/search/ResultsList'

export function useSearch(onCandidateSelect: (id: string) => void) {
  const searchType = useSearchStore((state) => state.searchType)
  const topK = useSearchStore((state) => state.topK)
  const setResults = useSearchStore((state) => state.setResults)
  const setSearching = useSearchStore((state) => state.setSearching)
  const addUserMessage = useChatStore((state) => state.addUserMessage)
  const addBotMessage = useChatStore((state) => state.addBotMessage)

  const submitQuery = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim()
      if (!trimmedQuery || useSearchStore.getState().isSearching) return

      const messageId = addUserMessage(trimmedQuery)
      setSearching(true)

      try {
        const response = await searchApi.searchResumes({
          query: trimmedQuery,
          topK,
          mode: searchType,
        })

        if (
          !useChatStore
            .getState()
            .messages.some((message) => message.id === messageId)
        ) {
          return
        }

        setResults(response.results, trimmedQuery)
        addBotMessage(
          createElement(ResultsList, {
            results: response.results,
            searchType: response.mode,
            duration: response.durationMs,
            query: response.query,
            degraded: response.degraded,
            warnings: response.warnings,
            onCandidateSelect,
          }),
        )
      } catch {
        if (
          useChatStore
            .getState()
            .messages.some((message) => message.id === messageId)
        ) {
          addBotMessage(
            createElement(
              'p',
              { className: 'search-error', role: 'alert' },
              'Search failed. Check the backend connection and try again.',
            ),
          )
        }
      } finally {
        setSearching(false)
      }
    },
    [
      addBotMessage,
      addUserMessage,
      onCandidateSelect,
      searchType,
      setResults,
      setSearching,
      topK,
    ],
  )

  return { submitQuery }
}
