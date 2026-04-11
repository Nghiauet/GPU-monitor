const COLORS = {
  green: '#4ecca3',
  yellow: '#f5a623',
  red: '#e94560',
  gray: '#666',
}

export default function StatusIndicator({ color = 'gray', size = 10 }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: COLORS[color] || color,
      flexShrink: 0,
    }} />
  )
}
