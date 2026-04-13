import { colors } from '../theme.js'

const COLORS = {
  green: colors.status.healthy,
  blue: colors.status.info,
  yellow: colors.status.warning,
  red: colors.status.critical,
  gray: colors.status.inactive,
}

export default function StatusIndicator({ color = 'gray', size = 10, pulse = false }) {
  const bg = COLORS[color] || color
  const isLive = pulse || color === 'green' || color === 'blue'

  return (
    <span
      className={isLive ? 'status-pulse' : undefined}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        flexShrink: 0,
        position: 'relative',
        boxShadow: isLive ? `0 0 6px ${bg}66` : undefined,
      }}
    />
  )
}
