import { useState } from 'react'
import type { RefObject } from 'react'
import { FileText, Upload } from 'lucide-react'

interface UploadDropzoneProps {
  inputRef: RefObject<HTMLInputElement | null>
  selectedFile: File | null
  disabled: boolean
  error?: string
  onFileSelected: (file: File | null) => void
}

export function UploadDropzone({
  inputRef,
  selectedFile,
  disabled,
  error,
  onFileSelected,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  function acceptFile(file?: File) {
    if (file) onFileSelected(file)
  }

  return (
    <div
      className={`upload-dropzone${isDragging ? ' is-dragging' : ''}${selectedFile ? ' has-file' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (disabled) return
        setIsDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (disabled) return
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (disabled) return
        setIsDragging(false)
        acceptFile(event.dataTransfer.files[0])
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Choose a PDF resume or drag and drop it here"
      aria-describedby="dropzone-description"
    >
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        accept=".pdf,application/pdf"
        disabled={disabled}
        aria-label="Browse for a PDF resume"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          acceptFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      <span className="dropzone-icon" aria-hidden="true">
        {selectedFile ? <FileText size={24} /> : <Upload size={24} />}
      </span>
      {selectedFile ? (
        <>
          <span className="dropzone-title">{selectedFile.name}</span>
          <span className="dropzone-description">
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · PDF
          </span>
          <span className="dropzone-browse">Choose a different file</span>
        </>
      ) : (
        <>
          <span className="dropzone-title">
            Drop your resume here, or <span>browse</span>
          </span>
          <span id="dropzone-description" className="dropzone-description">
            Select a PDF file from your device
          </span>
        </>
      )}
      {error && (
        <span className="dropzone-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
