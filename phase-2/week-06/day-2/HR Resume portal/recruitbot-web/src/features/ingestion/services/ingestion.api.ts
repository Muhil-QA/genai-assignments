import axios from 'axios'

export interface ResumeIngestionResponse {
  success: true
  message: string
  resumeId: string
  alreadyStored?: boolean
  data: {
    name?: string
    role?: string
    company?: string
    totalExperience?: number
    skillsCount: number
    embeddingModel: string
    embeddingDimension: number
  }
}

interface ResumeIngestionErrorResponse {
  success?: false
  errorCode?: string
  message?: string
  requestId?: string
}

const ingestionFailureLabels: Record<string, string> = {
  RESUME_EXTRACTION_FAILED: 'PDF extraction failed',
  RESUME_PARSE_FAILED: 'Resume parsing failed',
  EMBEDDING_FAILED: 'Embedding generation failed',
  INGESTION_FAILED: 'Resume ingestion failed',
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const ingestionUrl = `${apiBaseUrl}/v1/resume/ingest`

export const ingestionApi = {
  async ingestResume(file: File): Promise<ResumeIngestionResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await axios.post<unknown>(
      ingestionUrl,
      formData,
      { timeout: 120_000 },
    )

    if (!isResumeIngestionResponse(response.data)) {
      throw new Error('The ingestion service returned an invalid success response.')
    }

    return response.data
  },
}

function isResumeIngestionResponse(
  value: unknown,
): value is ResumeIngestionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const response = value as Record<string, unknown>
  const data = response.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false

  const resultData = data as Record<string, unknown>
  return response.success === true
    && typeof response.message === 'string'
    && typeof response.resumeId === 'string'
    && (response.alreadyStored === undefined
      || typeof response.alreadyStored === 'boolean')
    && typeof resultData.skillsCount === 'number'
    && Number.isFinite(resultData.skillsCount)
    && typeof resultData.embeddingModel === 'string'
    && typeof resultData.embeddingDimension === 'number'
    && Number.isInteger(resultData.embeddingDimension)
    && resultData.embeddingDimension > 0
}

export function getIngestionErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ResumeIngestionErrorResponse>(error)) {
    return error instanceof Error
      ? error.message
      : 'An unexpected error occurred while uploading the resume.'
  }

  const responseData = error.response?.data
  const message = responseData?.message
  const failureLabel = responseData?.errorCode
    ? ingestionFailureLabels[responseData.errorCode]
    : undefined

  if (failureLabel) {
    if (typeof message !== 'string' || !message.trim()) return failureLabel
    if (message.toLowerCase().startsWith(failureLabel.toLowerCase())) {
      return message
    }
    return `${failureLabel}: ${message}`
  }

  if (typeof message === 'string' && message.trim()) {
    return message
  }

  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'The upload timed out before the backend responded. Please retry.'
    }

    return 'Could not reach the ingestion backend. Check that it is running and try again.'
  }

  return `Resume upload failed with HTTP ${error.response.status}.`
}
