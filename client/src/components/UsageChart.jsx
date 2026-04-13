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
import { colors, CHART_COLORS, radius, fontSize, shadow } from '../theme.js'

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
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border.default} opacity={0.5} />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTick}
          stroke={colors.border.default}
          tick={{ fill: colors.text.muted, fontSize: 11 }}
          minTickGap={40}
          axisLine={{ stroke: colors.border.default }}
        />
        <YAxis
          stroke={colors.border.default}
          tick={{ fill: colors.text.muted, fontSize: 11 }}
          width={45}
          axisLine={{ stroke: colors.border.default }}
        />
        <Tooltip
          contentStyle={{
            background: colors.bg.secondary,
            border: `1px solid ${colors.border.light}`,
            borderRadius: radius.lg,
            fontSize: fontSize.base,
            color: colors.text.primary,
            boxShadow: shadow.lg,
            padding: '10px 14px',
          }}
          labelStyle={{ color: colors.text.secondary, marginBottom: 4 }}
          labelFormatter={(v) => formatTick(v)}
          cursor={{ stroke: colors.border.light }}
        />
        <Legend
          wrapperStyle={{ fontSize: fontSize.base, color: colors.text.secondary, paddingTop: '12px' }}
        />
        {lines.map(({ key, label }, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label || key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
