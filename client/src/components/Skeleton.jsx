import { colors, radius, spacing } from '../theme.js'

export function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: radius.md,
        ...style,
      }}
    />
  )
}

export function SkeletonCard({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }} className="fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.lg,
            padding: `${spacing.lg}px`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Skeleton width={120} height={14} />
            <Skeleton width={40} height={14} />
          </div>
          <Skeleton width="60%" height={12} style={{ marginBottom: spacing.sm }} />
          <Skeleton width="100%" height={6} style={{ marginTop: spacing.sm }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 6, minWidth = 300 }) {
  return (
    <div
      className="fade-in"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: `${spacing.md}px`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.lg,
            padding: `${spacing.lg}px`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Skeleton width={100} height={14} />
            <Skeleton width={50} height={14} />
          </div>
          <Skeleton width="70%" height={12} style={{ marginBottom: spacing.md }} />
          <Skeleton width="100%" height={6} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.md }}>
            <Skeleton width={60} height={12} />
            <Skeleton width={80} height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div
      className="fade-in"
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: `${spacing.md}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.border.default}` }}>
        <div style={{ display: 'flex', gap: spacing.xl }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} width={60 + Math.random() * 40} height={12} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderBottom: i < rows - 1 ? `1px solid ${colors.border.default}10` : 'none',
            display: 'flex',
            gap: spacing.xl,
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} width={50 + Math.random() * 60} height={12} />
          ))}
        </div>
      ))}
    </div>
  )
}
