import type { SessionContextBreakdown, ThemeKey } from 'claude-code'

import type { Segment, Snapshot } from '../types'

export type BarPart = { color: string; percent: number }

const LABELS: Record<string, string> = {
  'System prompt': 'system prompt',
  'System tools': 'tools',
  'MCP tools': 'mcp tools',
  'Custom agents': 'agents',
  'Memory files': 'memory files',
  Skills: 'skills',
  Messages: 'messages',
  'Free space': 'free',
}

const PALETTE: Record<string, string> = {
  'system prompt': '#5b84b1',
  tools: '#5fb3b3',
  'mcp tools': '#9b7fe6',
  agents: '#8fc66b',
  'memory files': '#e5c06b',
  skills: '#e79bb8',
  messages: '#d9693f',
  free: '#3b4252',
}

const FREE_COLOR = '#3b4252'

const trimZero = (s: string) => s.replace(/\.0$/, '')

export function formatTokens(n: number): string {
  if (n < 1000) {
    return `${Math.round(n)}`
  }
  if (n < 10_000) {
    return `${trimZero((n / 1000).toFixed(1))}k`
  }
  const k = Math.round(n / 1000)
  if (k < 1000) {
    return `${k}k`
  }
  return `${trimZero((n / 1_000_000).toFixed(1))}M`
}

export function percentOf(tokens: number, max: number): number {
  if (tokens <= 0 || max <= 0) {
    return 0
  }
  return Math.max(1, Math.round((tokens * 100) / max))
}

export function badgeColor(s: Snapshot): ThemeKey {
  const ratio = s.total / (s.compactsAt ?? s.max)
  if (ratio < 0.7) {
    return 'success'
  }
  return ratio < 0.9 ? 'warning' : 'error'
}

export function toSnapshot(b: SessionContextBreakdown): Snapshot {
  const segments: Segment[] = b.categories
    .filter(c => c.kind === 'used' || c.kind === 'free')
    .map(c => {
      const label = LABELS[c.name] ?? c.name.toLowerCase()
      return { label, tokens: c.tokens, color: PALETTE[label] ?? c.color, isFree: c.kind === 'free' }
    })

  return {
    total: b.totalTokens,
    max: b.rawMaxTokens,
    percent: b.percentage,
    compactsAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
    segments,
  }
}

export function barParts(s: Snapshot): { used: BarPart[]; freeColor: string } {
  return {
    used: s.segments
      .filter(seg => !seg.isFree && seg.tokens > 0)
      .map(seg => ({ color: seg.color, percent: percentOf(seg.tokens, s.max) })),
    freeColor: s.segments.find(seg => seg.isFree)?.color ?? FREE_COLOR,
  }
}
