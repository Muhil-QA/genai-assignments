import { useCallback, useRef, useState } from 'react'
import { candidateApi } from '@/lib/api/candidate.api'
import type { CandidateProfile } from '@/types/candidate.types'

export function useCandidateModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const openCandidateModal = useCallback(async (id: string) => {
    const currentRequest = ++requestVersion.current
    setCandidateId(id)
    setCandidate(null)
    setError(null)
    setLoading(true)
    setIsOpen(true)

    try {
      const profile = await candidateApi.getCandidate(id)
      if (requestVersion.current === currentRequest) setCandidate(profile)
    } catch {
      if (requestVersion.current === currentRequest) {
        setError('Unable to load this candidate profile. Please try again.')
      }
    } finally {
      if (requestVersion.current === currentRequest) setLoading(false)
    }
  }, [])

  const closeModal = useCallback(() => {
    requestVersion.current += 1
    setIsOpen(false)
    setCandidate(null)
    setCandidateId(null)
    setError(null)
    setLoading(false)
  }, [])

  const retry = useCallback(() => {
    if (candidateId) void openCandidateModal(candidateId)
  }, [candidateId, openCandidateModal])

  return {
    isOpen,
    candidate,
    candidateId,
    loading,
    error,
    openCandidateModal,
    closeModal,
    retry,
  }
}
