export interface CandidateProfile {
  _id: string
  name?: string
  email?: string
  phone?: string
  location?: string
  role?: string
  company?: string
  education?: string
  totalExperience?: number
  relevantExperience?: number
  skills: string[]
  jobTitles?: string[]
  experienceSummary?: string
  processedAt?: string
}
