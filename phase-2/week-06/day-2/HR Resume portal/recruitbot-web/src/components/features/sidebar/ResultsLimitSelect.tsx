import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSearchStore } from '@/lib/stores/search.store'

const resultLimits = [3, 5, 10, 20]

export function ResultsLimitSelect() {
  const topK = useSearchStore((state) => state.topK)
  const setTopK = useSearchStore((state) => state.setTopK)

  return (
    <div className="results-limit-control">
      <label htmlFor="results-limit">Show top</label>
      <Select
        value={String(topK)}
        onValueChange={(value) => {
          if (value) setTopK(Number(value))
        }}
      >
        <SelectTrigger
          id="results-limit"
          className="results-limit-select"
          aria-label="Number of search results"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {resultLimits.map((limit) => (
            <SelectItem key={limit} value={String(limit)}>
              {limit} results
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
