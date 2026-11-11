interface StatusDotProps {
  label?: string
}

export function StatusDot({ label = 'Online' }: StatusDotProps) {
  return (
    <span className="brand-status">
      <span
        className="brand-status-dot animate-status-pulse"
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  )
}
