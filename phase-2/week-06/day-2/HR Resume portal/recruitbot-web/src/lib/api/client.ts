import axios, { type AxiosError, type AxiosInstance } from 'axios'
import toast from 'react-hot-toast'
import { apiConfig } from '@/config/api.config'

interface ApiErrorResponse {
  error?: string
  errorCode?: string
  message?: string
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: apiConfig.baseUrl,
  timeout: apiConfig.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(
  (config) => {
    config.headers.set('X-Request-ID', crypto.randomUUID())
    return config
  },
  (error: unknown) => Promise.reject(error),
)

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      showApiError(error)
    }

    return Promise.reject(error)
  },
)

function showApiError(error: AxiosError<unknown>) {
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      toast.error('The request timed out. Please try again.')
    } else {
      toast.error('Network error. Check your connection.')
    }
    return
  }

  const { status } = error.response
  const payload = getApiErrorResponse(error.response.data)
  const message = payload?.error ?? payload?.message ?? 'An error occurred'

  if (status === 404) {
    toast.error(`Not found: ${message}`)
  } else if (status >= 500) {
    toast.error('Server error. Please try again later.')
  } else {
    toast.error(message)
  }
}

function getApiErrorResponse(value: unknown): ApiErrorResponse | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const response = value as Record<string, unknown>
  return {
    ...(typeof response.error === 'string' ? { error: response.error } : {}),
    ...(typeof response.errorCode === 'string'
      ? { errorCode: response.errorCode }
      : {}),
    ...(typeof response.message === 'string'
      ? { message: response.message }
      : {}),
  }
}

export default apiClient
