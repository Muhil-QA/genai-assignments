import { useSearchStore } from '@/lib/stores/search.store'

export function useHybridWeights() {
  const bm25Weight = useSearchStore((state) => state.bm25Weight)
  const vectorWeight = useSearchStore((state) => state.vectorWeight)
  const setWeights = useSearchStore((state) => state.setWeights)

  function handleBm25Change(value: number) {
    setWeights(value, 100 - value)
  }

  function handleVectorChange(value: number) {
    setWeights(100 - value, value)
  }

  function applyPreset(bm25: number, vector: number) {
    setWeights(bm25, vector)
  }

  return {
    bm25Weight,
    vectorWeight,
    handleBm25Change,
    handleVectorChange,
    applyPreset,
  }
}
