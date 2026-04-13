// Design tokens for GPU Monitor

export const colors = {
  bg: {
    primary: '#0f0f1a',
    secondary: '#161625',
    card: '#1a1a2e',
    cardHover: '#1e2240',
    cardSelected: '#1e2d50',
    input: '#12121f',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  border: {
    default: '#2a2a45',
    light: '#35355a',
    active: '#e94560',
    focus: '#4fc3f7',
  },
  text: {
    primary: '#e8e8f0',
    secondary: '#9898b0',
    muted: '#686880',
    inverse: '#0f0f1a',
  },
  accent: {
    red: '#e94560',
    green: '#4ecca3',
    blue: '#4fc3f7',
    orange: '#f5a623',
    purple: '#bb86fc',
    pink: '#ff6b9d',
  },
  status: {
    healthy: '#4ecca3',
    warning: '#f5a623',
    critical: '#e94560',
    info: '#4fc3f7',
    inactive: '#686880',
  },
}

export const CHART_COLORS = [
  colors.accent.red,
  colors.accent.green,
  colors.accent.blue,
  colors.accent.orange,
  colors.accent.purple,
  colors.accent.pink,
]

export const BORDER_ACCENT_COLORS = [
  colors.accent.red,
  colors.accent.green,
  colors.accent.blue,
  colors.accent.orange,
  colors.accent.purple,
]

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
}

export const fontSize = {
  xs: '10px',
  sm: '11px',
  base: '12px',
  md: '13px',
  lg: '14px',
  xl: '16px',
  xxl: '18px',
  hero: '22px',
}

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
}

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
}

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  pill: '9999px',
}

export const shadow = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.3)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.4)',
  glow: (color) => `0 0 20px ${color}33`,
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.35)',
}

export const transition = {
  fast: '0.15s ease',
  normal: '0.2s ease',
  slow: '0.3s ease',
}

// Style helpers

export function cardStyle({ selected = false, hoverable = true } = {}) {
  return {
    background: selected ? colors.bg.cardSelected : colors.bg.card,
    border: `1px solid ${selected ? colors.border.active : colors.border.default}`,
    borderRadius: radius.lg,
    padding: `${spacing.lg}px ${spacing.lg}px`,
    cursor: hoverable ? 'pointer' : 'default',
    transition: `all ${transition.normal}`,
    boxShadow: shadow.sm,
  }
}

export function inputStyle() {
  return {
    width: '100%',
    background: colors.bg.input,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.sm,
    padding: '8px 12px',
    fontSize: fontSize.md,
    lineHeight: lineHeight.normal,
    transition: `border-color ${transition.fast}`,
    outline: 'none',
  }
}

export function selectStyle() {
  return {
    ...inputStyle(),
    cursor: 'pointer',
  }
}

export function buttonStyle(variant = 'primary') {
  const base = {
    border: 'none',
    borderRadius: radius.md,
    padding: '8px 16px',
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    cursor: 'pointer',
    transition: `all ${transition.fast}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${spacing.sm}px`,
    lineHeight: lineHeight.normal,
  }

  switch (variant) {
    case 'primary':
      return { ...base, background: colors.accent.red, color: '#fff' }
    case 'success':
      return { ...base, background: colors.accent.green, color: colors.text.inverse }
    case 'warning':
      return { ...base, background: colors.accent.orange, color: colors.text.inverse }
    case 'secondary':
      return { ...base, background: colors.border.default, color: colors.text.primary, border: `1px solid ${colors.border.light}` }
    case 'danger':
      return { ...base, background: 'transparent', color: colors.accent.red, border: `1px solid ${colors.accent.red}` }
    case 'ghost':
      return { ...base, background: 'transparent', color: colors.text.secondary, border: `1px solid ${colors.border.default}`, padding: '6px 10px' }
    default:
      return base
  }
}

export function badgeStyle(color = colors.accent.green) {
  return {
    fontSize: fontSize.sm,
    color,
    background: `${color}15`,
    padding: '2px 10px',
    borderRadius: radius.pill,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.normal,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  }
}

export function sectionStyle() {
  return {
    background: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    marginBottom: `${spacing.xl}px`,
    overflow: 'hidden',
    boxShadow: shadow.sm,
  }
}

export function sectionHeaderStyle() {
  return {
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border.default}`,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  }
}

export function pageHeaderStyle() {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: `${spacing.xxl}px`,
    flexWrap: 'wrap',
    gap: `${spacing.md}px`,
  }
}

export function pageTitleStyle() {
  return {
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    letterSpacing: '-0.3px',
  }
}

export function errorBannerStyle() {
  return {
    color: colors.accent.red,
    background: `${colors.accent.red}10`,
    border: `1px solid ${colors.accent.red}30`,
    borderRadius: radius.lg,
    padding: `${spacing.md}px ${spacing.lg}px`,
    marginBottom: `${spacing.lg}px`,
    fontSize: fontSize.md,
    display: 'flex',
    alignItems: 'center',
    gap: `${spacing.sm}px`,
  }
}

export function emptyStateStyle() {
  return {
    color: colors.text.muted,
    padding: '48px 24px',
    textAlign: 'center',
    fontSize: fontSize.lg,
    lineHeight: lineHeight.relaxed,
  }
}

export function tabBarStyle() {
  return {
    display: 'flex',
    gap: '0px',
    marginBottom: `${spacing.xl}px`,
    borderBottom: `1px solid ${colors.border.default}`,
  }
}

export function tabBtnStyle(active) {
  return {
    padding: '10px 20px',
    fontSize: fontSize.md,
    border: 'none',
    borderBottom: `2px solid ${active ? colors.accent.red : 'transparent'}`,
    background: 'transparent',
    color: active ? colors.text.primary : colors.text.secondary,
    cursor: 'pointer',
    fontWeight: active ? fontWeight.semibold : fontWeight.normal,
    transition: `all ${transition.fast}`,
    lineHeight: lineHeight.normal,
  }
}

export function tableHeaderStyle() {
  return {
    padding: '12px 14px',
    textAlign: 'left',
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    background: colors.bg.secondary,
    position: 'sticky',
    top: 0,
    zIndex: 1,
  }
}

export function tableCellStyle(color) {
  return {
    padding: '12px 14px',
    color: color || colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
  }
}

export function progressBarBg() {
  return {
    background: colors.border.default,
    borderRadius: radius.sm,
    height: '6px',
    overflow: 'hidden',
  }
}

export function progressBarFill(pct, color) {
  return {
    width: `${Math.min(pct ?? 0, 100)}%`,
    height: '100%',
    background: color,
    borderRadius: radius.sm,
    transition: `width ${transition.slow}`,
  }
}

export function metricLabelStyle() {
  return {
    color: colors.text.muted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '2px',
  }
}

export function metricValueStyle() {
  return {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  }
}
