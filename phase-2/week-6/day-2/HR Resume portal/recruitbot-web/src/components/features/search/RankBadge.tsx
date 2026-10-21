interface RankBadgeProps {
  rank: number
}

export function RankBadge({ rank }: RankBadgeProps) {
  return (
    <span
      className={`rank-badge${rank <= 3 ? ' is-top-rank' : ''}`}
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </span>
  )
}
