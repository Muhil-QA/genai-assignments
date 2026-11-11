import { IngestionResult } from '../components/IngestionResult'
import { ResumeUploadCard } from '../components/ResumeUploadCard'
import type { UploadStatus } from '../components/UploadProgress'
import { useIngestionStore } from '../stores/ingestion.store'
import {
  getIngestionErrorMessage,
  ingestionApi,
} from '../services/ingestion.api'
import { apiConfig } from '@/config/api.config'
import '../../../App.css'

export function IngestionPage() {
  const selectedFile = useIngestionStore((state) => state.selectedFile)
  const isUploading = useIngestionStore((state) => state.isUploading)
  const successResult = useIngestionStore((state) => state.successResult)
  const error = useIngestionStore((state) => state.error)
  const setSelectedFile = useIngestionStore((state) => state.setSelectedFile)
  const startUpload = useIngestionStore((state) => state.startUpload)
  const completeUpload = useIngestionStore((state) => state.completeUpload)
  const failUpload = useIngestionStore((state) => state.failUpload)
  const reset = useIngestionStore((state) => state.reset)

  const status: UploadStatus = isUploading
    ? 'uploading'
    : error
      ? 'error'
      : successResult
        ? 'success'
        : selectedFile
          ? 'ready'
          : 'idle'
  const message = error ?? successResult?.message

  async function handleUploadRequest() {
    const file = startUpload()
    if (!file) return

    try {
      const result = await ingestionApi.ingestResume(file)
      completeUpload(result)
    } catch (error: unknown) {
      failUpload(getIngestionErrorMessage(error))
    }
  }

  return (
    <main className="ingestion-shell">
      <div className="ingestion-content">
        <header className="ingestion-header">
          <a
            className="brand-mark"
            href="/"
            aria-label={`${apiConfig.appName} home`}
          >
            <span className="brand-icon" aria-hidden="true">
              &lt;/&gt;
            </span>
            <span>{apiConfig.appName}</span>
          </a>
          <span className="setup-badge">
            <span aria-hidden="true" />
            INGESTION
          </span>
        </header>

        <section className="ingestion-intro" aria-labelledby="page-title">
          <p className="eyebrow">CANDIDATE KNOWLEDGE BASE</p>
          <h1 id="page-title">Resume ingestion</h1>
          <p className="intro-copy">
            {successResult
              ? 'Your resume processing result is ready.'
              : 'Add a resume to prepare it for your candidate knowledge base.'}
          </p>
        </section>

        {successResult ? (
          <IngestionResult
            fileName={selectedFile?.name ?? 'Resume PDF'}
            result={successResult}
            onUploadAnother={reset}
          />
        ) : (
          <ResumeUploadCard
            selectedFile={selectedFile}
            status={status}
            message={message}
            isUploading={isUploading}
            onFileSelected={setSelectedFile}
            onUploadRequest={handleUploadRequest}
          />
        )}

        <footer className="ingestion-footer">
          Your files are used only to power candidate discovery.
        </footer>
      </div>
    </main>
  )
}
