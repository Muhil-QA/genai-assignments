import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from '@/components/ui/dialog'
import type { CandidateProfile } from '@/types/candidate.types'
import { ContactSection } from './ContactSection'
import { EducationSection } from './EducationSection'
import { ExperienceSection } from './ExperienceSection'
import { ModalHeader } from './ModalHeader'
import { SkillsSection } from './SkillsSection'

interface CandidateModalProps {
  open: boolean
  candidate: CandidateProfile | null
  loading: boolean
  error: string | null
  onClose: () => void
  onRetry: () => void
}

export function CandidateModal({
  open,
  candidate,
  loading,
  error,
  onClose,
  onRetry,
}: CandidateModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="candidate-modal-content"
        showCloseButton={false}
      >
        <motion.div
          className="candidate-modal-card"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <ModalHeader candidate={candidate} />
          <DialogDescription className="sr-only">
            Candidate profile details
          </DialogDescription>

          <div
            className="candidate-modal-body"
            aria-busy={loading}
            aria-live="polite"
          >
            {loading ? (
              <div className="candidate-profile-skeleton" role="status">
                <span className="sr-only">Loading candidate profile</span>
                <div />
                <div />
                <div />
                <div />
              </div>
            ) : error ? (
              <div className="candidate-profile-error" role="alert">
                <p>{error}</p>
                <Button type="button" variant="outline" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            ) : candidate ? (
              <div className="candidate-profile-sections">
                <ContactSection candidate={candidate} />
                <ExperienceSection candidate={candidate} />
                <SkillsSection skills={candidate.skills} />
                <EducationSection education={candidate.education} />
              </div>
            ) : null}
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
