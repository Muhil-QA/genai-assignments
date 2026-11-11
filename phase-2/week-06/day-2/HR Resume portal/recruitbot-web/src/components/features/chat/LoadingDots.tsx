export function LoadingDots() {
  return (
    <span
      className="loading-dots"
      role="status"
      aria-label="Searching candidates"
    >
      <span />
      <span />
      <span />
      <span className="loading-dots-label">Searching candidates…</span>
    </span>
  )
}
