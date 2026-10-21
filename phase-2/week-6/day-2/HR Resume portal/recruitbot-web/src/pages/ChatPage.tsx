import { ChatInputBar } from '@/components/features/chat/ChatInputBar'
import { ChatMessages } from '@/components/features/chat/ChatMessages'
import { ChatTopbar } from '@/components/features/chat/ChatTopbar'
import { CandidateModal } from '@/components/features/candidate/CandidateModal'
import { useCandidateModal } from '@/hooks/use-candidate-modal'
import { useSearch } from '@/hooks/use-search'

export function ChatPage() {
  const candidateModal = useCandidateModal()
  const { submitQuery } = useSearch(candidateModal.openCandidateModal)

  return (
    <>
      <section
        className="chat-workspace"
        aria-label="Candidate search workspace"
      >
        <ChatTopbar />
        <ChatMessages onSuggestionSelect={submitQuery} />
        <ChatInputBar onSubmit={submitQuery} />
      </section>
      <CandidateModal
        open={candidateModal.isOpen}
        candidate={candidateModal.candidate}
        loading={candidateModal.loading}
        error={candidateModal.error}
        onClose={candidateModal.closeModal}
        onRetry={candidateModal.retry}
      />
    </>
  )
}
