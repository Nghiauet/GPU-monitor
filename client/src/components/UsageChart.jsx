import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'

const COLORS = ['#e94560', '#4ecca3', '#4fc3f7', '#f5a623', '#bb86fc']

function formatTick(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

export default function UsageChart({ data = [], lines = [], height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a5c" />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTick}
          stroke="#444"
          tick={{ fill: '#888', fontSize: 11 }}
          minTickGap={40}
        />
        <YAxis
          stroke="#444"
          tick={{ fill: '#888', fontSize: 11 }}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: '#16213e',
            border: '1px solid #2a3a5c',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#e0e0e0',
          }}
          labelStyle={{ color: '#888' }}
          labelFormatter={(v) => formatTick(v)}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: '#888', paddingTop: '8px' }}
        />
        {lines.map(({ key, label }, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label || key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
