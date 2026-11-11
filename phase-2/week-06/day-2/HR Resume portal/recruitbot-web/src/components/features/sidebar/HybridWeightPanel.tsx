import { AnimatePresence, motion } from 'framer-motion'
import { useHybridWeights } from '@/hooks/use-hybrid-weights'
import { Slider } from '@/components/ui/slider'

const presets = [
  { label: '50 / 50', bm25: 50, vector: 50 },
  { label: '70 / 30', bm25: 70, vector: 30 },
  { label: '30 / 70', bm25: 30, vector: 70 },
]

interface HybridWeightPanelProps {
  isVisible: boolean
}

export function HybridWeightPanel({ isVisible }: HybridWeightPanelProps) {
  const {
    bm25Weight,
    vectorWeight,
    handleBm25Change,
    handleVectorChange,
    applyPreset,
  } = useHybridWeights()

  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.section
          className="hybrid-weight-panel"
          aria-label="Search Weights"
          initial={{ height: 0, opacity: 0, y: -8 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <h3>Search Weights</h3>

          <div className="weight-control">
            <div className="weight-label-row">
              <label htmlFor="bm25-weight">BM25</label>
              <output htmlFor="bm25-weight">{bm25Weight}%</output>
            </div>
            <Slider
              id="bm25-weight"
              aria-label="BM25 search weight"
              min={0}
              max={100}
              step={1}
              value={[bm25Weight]}
              onValueChange={(values) => {
                const value = Array.isArray(values) ? values[0] : values
                if (typeof value === 'number') handleBm25Change(value)
              }}
            />
          </div>

          <div className="weight-control">
            <div className="weight-label-row">
              <label htmlFor="vector-weight">Vector</label>
              <output htmlFor="vector-weight">{vectorWeight}%</output>
            </div>
            <Slider
              id="vector-weight"
              aria-label="Vector search weight"
              min={0}
              max={100}
              step={1}
              value={[vectorWeight]}
              onValueChange={(values) => {
                const value = Array.isArray(values) ? values[0] : values
                if (typeof value === 'number') handleVectorChange(value)
              }}
            />
          </div>

          <div className="weight-presets" aria-label="Weight presets">
            {presets.map((preset) => {
              const isActive =
                bm25Weight === preset.bm25 && vectorWeight === preset.vector

              return (
                <button
                  className={`weight-preset${isActive ? ' is-active' : ''}`}
                  type="button"
                  key={preset.label}
                  aria-pressed={isActive}
                  onClick={() => applyPreset(preset.bm25, preset.vector)}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <p className="weight-backend-note">
            The current search endpoint does not accept these custom weights.
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
