import {
  Check,
  CircleHelp,
  FileCheck2,
  RotateCcw,
  Sparkles,
  Database,
} from 'lucide-react'
import type { ResumeIngestionResponse } from '../services/ingestion.api'

interface IngestionResultProps {
  fileName: string
  result: ResumeIngestionResponse
  onUploadAnother: () => void
}

export function IngestionResult({
  fileName,
  result,
  onUploadAnother,
}: IngestionResultProps) {
  const isExistingResume = result.alreadyStored === true

  return (
    <section
      className="result-card"
      aria-labelledby="result-title"
      aria-live="polite"
    >
      <div className="result-success-icon" aria-hidden="true">
        <Check size={27} />
      </div>
      <p className="result-eyebrow">
        {isExistingResume ? 'EXISTING RESUME FOUND' : 'INGESTION COMPLETE'}
      </p>
      <h2 id="result-title">
        {isExistingResume
          ? 'This resume was already ingested'
          : 'Resume ingestion completed'}
      </h2>
      <p className="result-file-name">{fileName}</p>
      <p className="result-message">{result.message}</p>

      <ul className="result-checklist">
        <li>
          <span className="result-check-icon" aria-hidden="true">
            <FileCheck2 size={17} />
          </span>
          <span>
            <strong>
              {isExistingResume
                ? 'Existing resume matched'
                : 'Resume uploaded successfully'}
            </strong>
            <small>
              {isExistingResume
                ? 'The backend matched this resume to an existing record.'
                : 'The backend accepted and processed the PDF.'}
            </small>
          </span>
        </li>
        <li>
          <span className="result-check-icon" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <span>
            <strong>
              {isExistingResume
                ? 'Embedding generation skipped'
                : 'Embedding generated successfully'}
            </strong>
            <small>
              {isExistingResume
                ? 'No new embedding was generated for the existing record.'
                : `${result.data.embeddingModel} · ${result.data.embeddingDimension} dimensions`}
            </small>
          </span>
        </li>
        <li>
          <span className="result-check-icon" aria-hidden="true">
            <Database size={17} />
          </span>
          <span>
            <strong>MongoDB ingestion completed</strong>
            <small>
              {isExistingResume
                ? 'The matching resume record is already stored.'
                : 'The backend confirmed the resume was stored.'}
            </small>
          </span>
        </li>
      </ul>

      <div className="result-readiness-note">
        <CircleHelp size={17} aria-hidden="true" />
        <p>
          Vector search readiness is not reported by the ingestion response.
        </p>
      </div>

      <button
        className="upload-another-button"
        type="button"
        onClick={onUploadAnother}
      >
        <RotateCcw size={16} aria-hidden="true" />
        Upload Another Resume
      </button>
    </section>
  )
}
