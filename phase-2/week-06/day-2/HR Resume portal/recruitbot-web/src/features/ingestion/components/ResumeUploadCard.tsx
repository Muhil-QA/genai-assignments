import { useRef, useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { UploadButton } from './UploadButton'
import { UploadDropzone } from './UploadDropzone'
import { UploadProgress, type UploadStatus } from './UploadProgress'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

interface ResumeUploadCardProps {
  selectedFile: File | null
  status: UploadStatus
  message?: string
  isUploading: boolean
  onFileSelected: (file: File | null) => void
  onUploadRequest: () => void
}

export function ResumeUploadCard({
  selectedFile,
  status,
  message,
  isUploading,
  onFileSelected,
  onUploadRequest,
}: ResumeUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [validationError, setValidationError] = useState<string>()

  function handleFileSelected(file: File | null) {
    setValidationError(undefined)

    if (!file) {
      onFileSelected(null)
      return
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      onFileSelected(null)
      setValidationError('Only PDF allowed')
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      onFileSelected(null)
      setValidationError('Maximum 5MB allowed')
      return
    }

    onFileSelected(file)
  }

  function handleUploadClick() {
    if (!selectedFile) {
      setValidationError('Please select a file')
      return
    }

    setValidationError(undefined)
    onUploadRequest()
  }

  return (
    <section className="upload-card" aria-label="Upload a resume">
      <div className="upload-card-heading">
        <span className="section-icon" aria-hidden="true">
          <FileText size={19} />
        </span>
        <div>
          <h2>Add a resume</h2>
          <p>Choose a PDF resume from your device.</p>
        </div>
      </div>

      <UploadDropzone
        inputRef={fileInputRef}
        selectedFile={selectedFile}
        disabled={isUploading}
        error={validationError}
        onFileSelected={handleFileSelected}
      />

      <div className="upload-action-row">
        <p className="file-guidance">PDF files only · Maximum 5MB</p>
        <UploadButton
          disabled={isUploading || status === 'error'}
          isUploading={isUploading}
          onClick={handleUploadClick}
        />
      </div>

      <UploadProgress status={status} message={message} />
      {status === 'error' && selectedFile && (
        <div className="upload-recovery-actions">
          <button
            className="upload-retry-button"
            type="button"
            disabled={isUploading}
            onClick={onUploadRequest}
          >
            Retry
          </button>
          <button
            className="upload-choose-file-button"
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose Another File
          </button>
        </div>
      )}

      <div className="privacy-note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Secure upload · Your resume stays private</span>
      </div>
    </section>
  )
}
