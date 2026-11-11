import { create } from 'zustand'

interface UiState {
  isCandidateModalOpen: boolean
  selectedCandidateId: string | null
  isMobileSidebarOpen: boolean
  openCandidateModal: (candidateId: string) => void
  closeCandidateModal: () => void
  setMobileSidebarOpen: (isOpen: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  isCandidateModalOpen: false,
  selectedCandidateId: null,
  isMobileSidebarOpen: false,
  openCandidateModal: (selectedCandidateId) =>
    set({ isCandidateModalOpen: true, selectedCandidateId }),
  closeCandidateModal: () =>
    set({ isCandidateModalOpen: false, selectedCandidateId: null }),
  setMobileSidebarOpen: (isMobileSidebarOpen) => set({ isMobileSidebarOpen }),
}))
