import apiClient from '@/lib/api/client'
import type { CandidateProfile } from '@/types/candidate.types'

export const candidateApi = {
  async getCandidate(id: string): Promise<CandidateProfile> {
    const { data } = await apiClient.get<CandidateProfile>(
      `/v1/candidate/${encodeURIComponent(id)}`,
    )
    return data
  },
}
