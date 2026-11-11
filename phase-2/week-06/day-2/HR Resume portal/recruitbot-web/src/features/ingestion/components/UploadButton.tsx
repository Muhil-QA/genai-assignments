import { ArrowUpFromLine, LoaderCircle } from 'lucide-react'

interface UploadButtonProps {
  disabled: boolean
  isUploading: boolean
  onClick: () => void
}

export function UploadButton({
  disabled,
  isUploading,
  onClick,
}: UploadButtonProps) {
  return (
    <button
      className="upload-button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={isUploading ? 'Uploading resume' : 'Upload Resume'}
    >
      {isUploading ? (
        <LoaderCircle className="status-spinner" size={17} aria-hidden="true" />
      ) : (
        <ArrowUpFromLine size={17} aria-hidden="true" />
      )}
      {isUploading ? 'Uploading...' : 'Upload Resume'}
    </button>
  )
}
