import { create } from 'zustand'
import type { ResumeIngestionResponse } from '../services/ingestion.api'

interface IngestionState {
  selectedFile: File | null
  isUploading: boolean
  uploadProgress: number | null
  successResult: ResumeIngestionResponse | null
  error: string | null
  setSelectedFile: (file: File | null) => void
  setUploadProgress: (progress: number | null) => void
  startUpload: () => File | null
  completeUpload: (result: ResumeIngestionResponse) => void
  failUpload: (message: string) => void
  reset: () => void
}

const initialState = {
  selectedFile: null,
  isUploading: false,
  uploadProgress: null,
  successResult: null,
  error: null,
}

export const useIngestionStore = create<IngestionState>((set, get) => ({
  ...initialState,
  setSelectedFile: (file) =>
    set({
      selectedFile: file,
      isUploading: false,
      uploadProgress: null,
      successResult: null,
      error: null,
    }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  startUpload: () => {
    const { selectedFile, isUploading } = get()
    if (!selectedFile || isUploading) return null

    set({
      isUploading: true,
      uploadProgress: null,
      successResult: null,
      error: null,
    })
    return selectedFile
  },
  completeUpload: (result) =>
    set({
      isUploading: false,
      uploadProgress: 100,
      successResult: result,
      error: null,
    }),
  failUpload: (message) =>
    set({
      isUploading: false,
      uploadProgress: null,
      successResult: null,
      error: message,
    }),
  reset: () => set(initialState),
}))
