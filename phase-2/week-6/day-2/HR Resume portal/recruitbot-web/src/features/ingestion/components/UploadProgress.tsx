import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
} from 'lucide-react'

export type UploadStatus =
  | 'idle'
  | 'ready'
  | 'uploading'
  | 'success'
  | 'error'

interface UploadProgressProps {
  status: UploadStatus
  message?: string
}

const ingestionStages = [
  'Resume Upload',
  'PDF Processing',
  'Resume Parsing',
  'Embedding Generation',
  'MongoDB ingestion',
  'Completed',
]

const statusContent: Record<
  UploadStatus,
  { label: string; description: string }
> = {
  idle: {
    label: 'Upload status',
    description: 'Your upload status will appear here.',
  },
  ready: {
    label: 'Ready to upload',
    description: 'Your PDF is selected and ready.',
  },
  uploading: {
    label: 'Uploading resume',
    description: 'Please wait while your resume is uploaded.',
  },
  success: {
    label: 'Resume ingestion completed',
    description: 'The backend confirmed that the resume was ingested.',
  },
  error: {
    label: 'Upload failed',
    description: 'We could not upload your resume.',
  },
}

export function UploadProgress({ status, message }: UploadProgressProps) {
  const content = statusContent[status]
  const isActive = status === 'uploading'
  const isSuccess = status === 'success'
  const isError = status === 'error'

  return (
    <div
      className={`upload-status status-${status}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <span className="status-indicator" aria-hidden="true">
        {isActive ? (
          <LoaderCircle className="status-spinner" size={18} />
        ) : isSuccess ? (
          <CheckCircle2 size={18} />
        ) : isError ? (
          <AlertCircle size={18} />
        ) : (
          <span />
        )}
      </span>
      <span className="status-copy">
        <strong>{content.label}</strong>
        <span>{message ?? content.description}</span>
      </span>
      <section
        className="pipeline-progress"
        aria-label="Ingestion pipeline progress"
      >
        <div className="pipeline-heading">
          <strong>Ingestion pipeline</strong>
          {isSuccess && <span>All steps confirmed</span>}
        </div>
        {isActive && (
          <p className="pipeline-live-note">
            Uploading / processing — waiting for the backend response. Individual
            processing-stage events are not available.
          </p>
        )}
        {isError && (
          <p className="pipeline-live-note">
            Processing stopped. The backend did not report an individual stage.
          </p>
        )}
        <ol className={`pipeline-stages${isSuccess ? ' is-complete' : ''}`}>
          {ingestionStages.map((stage) => (
            <li
              className={`pipeline-stage${isSuccess ? ' is-complete' : ''}`}
              key={stage}
            >
              <span className="pipeline-stage-icon" aria-hidden="true">
                {isSuccess ? <Check size={13} /> : <Circle size={13} />}
              </span>
              <span>{stage}</span>
            </li>
          ))}
        </ol>
        {!isSuccess && (
          <p className="pipeline-pending-note">
            Pipeline stages are confirmed only after ingestion succeeds.
          </p>
        )}
      </section>
    </div>
  )
}
