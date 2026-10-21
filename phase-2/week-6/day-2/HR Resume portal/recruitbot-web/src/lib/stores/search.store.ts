import { create } from 'zustand'
import type { SearchMode, SearchResult } from '@/types/search.types'

interface SearchState {
  searchType: SearchMode
  bm25Weight: number
  vectorWeight: number
  topK: number
  results: SearchResult[]
  isSearching: boolean
  lastQuery: string
  setSearchType: (mode: SearchMode) => void
  setWeights: (bm25: number, vector: number) => void
  setTopK: (count: number) => void
  setResults: (results: SearchResult[], query: string) => void
  setSearching: (isSearching: boolean) => void
}

export const useSearchStore = create<SearchState>((set) => ({
  searchType: 'vector',
  bm25Weight: 50,
  vectorWeight: 50,
  topK: 5,
  results: [],
  isSearching: false,
  lastQuery: '',
  setSearchType: (searchType) => set({ searchType }),
  setWeights: (bm25Weight, vectorWeight) => set({ bm25Weight, vectorWeight }),
  setTopK: (topK) => set({ topK }),
  setResults: (results, lastQuery) => set({ results, lastQuery }),
  setSearching: (isSearching) => set({ isSearching }),
}))
