import { X } from 'lucide-react'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import type { CandidateProfile } from '@/types/candidate.types'

interface ModalHeaderProps {
  candidate: CandidateProfile | null
}

export function ModalHeader({ candidate }: ModalHeaderProps) {
  const meta = [candidate?.role, candidate?.company].filter(Boolean).join(' · ')

  return (
    <header className="candidate-modal-header">
      <div>
        <DialogTitle className="candidate-modal-title">
          {candidate?.name || 'Candidate profile'}
        </DialogTitle>
        {meta && <p className="candidate-modal-meta">{meta}</p>}
      </div>
      <DialogClose
        className="candidate-modal-close"
        aria-label="Close candidate profile"
      >
        <X size={18} aria-hidden="true" />
      </DialogClose>
    </header>
  )
}
