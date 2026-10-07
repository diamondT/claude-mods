import type { AgentInfo, AgentStatus, TurnCompleteReason, TurnUsage } from 'claude-code'

import type { AgentRun, Others, RunStatus } from '../types'

export const MAX_RUNS = 30
const MAX_LOOPS = 50
const LABEL_MAX = 80
const ARG_KEYS = [
  'command',
  'pattern',
  'file_path',
  'notebook_path',
  'path',
  'url',
  'query',
  'description',
  'skill',
  'prompt',
]
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// flightdeck
export const C = {
  coral: '#e8805a',
  lavender: '#aab3f0',
  green: '#5bbf7a',
  purple: '#a48bf5',
  teal: '#64c4bd',
  amber: '#e0b062',
  red: '#e5605a',
  text: '#e4e4e4',
  dim: '#8c8c96',
  line: '#4a4a55',
}

const TYPE_COLORS: Record<string, string> = { 'general-purpose': C.coral, Explore: C.lavender, Plan: C.green }
const SPARE_COLORS = [C.purple, C.teal, C.amber]

const STATE_WORDS: Record<RunStatus, string> = {
  running: 'working',
  waiting: 'waiting',
  idle: 'idle',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

const FROM_LIST: Record<AgentStatus, RunStatus> = {
  pending: 'running',
  running: 'running',
  waiting: 'waiting',
  idle: 'idle',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
}

export type Spawn = {
  id: string
  parentId?: string
  type: string
  description: string
  model?: string
  isTeammate?: boolean
}

export type Mark = { glyph: string; color: string }

export type Piece = { text: string; color: string; bold?: boolean }

export type Stat = { label: string; value: string }

export type TimelineParts = { before: number; active: number; after: number }

export const isActive = (r: AgentRun) => r.status === 'running' || r.status === 'waiting'

export const isLive = (r: AgentRun) => isActive(r) || r.status === 'idle'

export const stateWord = (s: RunStatus) => STATE_WORDS[s]

export function typeColor(type: string): string {
  const known = TYPE_COLORS[type]
  if (known) {
    return known
  }
  let hash = 0
  for (const ch of type) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }
  return SPARE_COLORS[hash % SPARE_COLORS.length] ?? C.purple
}

export function mark(r: AgentRun): Mark {
  switch (r.status) {
    case 'running':
      return { glyph: '●', color: typeColor(r.type) }
    case 'waiting':
      return { glyph: '◌', color: C.dim }
    case 'idle':
      return { glyph: '○', color: C.dim }
    case 'done':
      return { glyph: '✓', color: C.green }
    case 'failed':
      return { glyph: '✗', color: C.red }
    case 'stopped':
      return { glyph: '■', color: C.amber }
  }
}

const MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function modelName(id: string): string {
  const m = MODEL_ID.exec(id)
  if (!m) {
    return capitalize(id)
  }
  const [, family = '', major = '', minor, oneM] = m
  const name = `${capitalize(family)} ${minor ? `${major}.${minor}` : major}`
  return oneM ? `${name} (1M context)` : name
}

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

const pad2 = (n: number) => String(n).padStart(2, '0')

// 0:40, 12:05, 1:02:03
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`
}

export const elapsed = (r: AgentRun, now: number) => formatClock((r.endedAt ?? now) - r.startedAt)

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function toolLabel(tool: string, input: Readonly<Record<string, unknown>>): string {
  const arg = ARG_KEYS.map(k => input[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (arg === undefined) {
    return tool
  }
  const flat = arg.replace(/\s+/g, ' ').trim()
  return `${tool}(${flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat})`
}

export function effortCells(effort: string | null): { filled: number; total: number } | null {
  const i = effort === null ? -1 : EFFORTS.indexOf(effort)
  return i === -1 ? null : { filled: i + 1, total: EFFORTS.length }
}

// AGENTS · 2 WORKING · 3 DONE
export function title(runs: readonly AgentRun[]): Piece[] {
  const count = (...statuses: RunStatus[]) => runs.filter(r => statuses.includes(r.status)).length
  const out: Piece[] = [{ text: 'AGENTS', color: C.text, bold: true }]
  const counts: [number, string, string][] = [
    [count('running'), 'WORKING', C.coral],
    [count('waiting', 'idle'), 'WAITING', C.lavender],
    [count('done'), 'DONE', C.green],
    [count('failed'), 'FAILED', C.red],
    [count('stopped'), 'STOPPED', C.amber],
  ]
  for (const [n, word, color] of counts) {
    if (n > 0) {
      out.push({ text: ' · ', color: C.dim }, { text: `${n} ${word}`, color, bold: true })
    }
  }
  return out
}

// the agent types seen, in order of first spawn
export function legend(runs: readonly AgentRun[]): Piece[] {
  return [...new Set(runs.map(r => r.type))].map(type => ({ text: type, color: typeColor(type) }))
}

export function headline(runs: readonly AgentRun[]): string {
  return `agents · ${runs.filter(isActive).length} running · ${runs.length} total`
}

export function othersLine({ loops, requests }: Others): string | null {
  return loops.length === 0 ? null : `${plural(loops.length, 'fork')} · ${requests} req`
}

export function cardStats(r: AgentRun, now: number): Stat[] {
  const tokens =
    r.contextTokens > 0
      ? [
          { label: 'ctx', value: formatTokens(r.contextTokens) },
          { label: 'out', value: formatTokens(r.outputTokens) },
        ]
      : []
  return [
    ...(r.model ? [{ label: 'model', value: modelName(r.model) }] : []),
    { label: 'tools', value: `${r.toolUses}` },
    { label: 'req', value: `${r.requests}` },
    ...tokens,
    { label: 'for', value: elapsed(r, now) },
  ]
}

// ╌╌╌●╌╌╌╌╌╌●╌╌╌╌╌╌●╌╌╌ between two cards, the dots in the next card's color
export function connector(width: number, color: string): Piece[] {
  const w = Math.max(3, width)
  const out: Piece[] = []
  let at = 0
  for (const dot of [Math.floor(w / 6), Math.floor(w / 2), Math.floor((5 * w) / 6)]) {
    out.push({ text: '╌'.repeat(dot - at), color: C.line }, { text: '●', color })
    at = dot + 1
  }
  out.push({ text: '╌'.repeat(w - at), color: C.line })
  return out.filter(p => p.text !== '')
}

// spawn order, each agent's children under it
export function ordered(runs: readonly AgentRun[]): [AgentRun, number][] {
  const ids = new Set(runs.map(r => r.id))
  const out: [AgentRun, number][] = []
  const walk = (parent: string | null, depth: number) => {
    for (const r of runs) {
      const p = r.parentId !== null && r.parentId !== r.id && ids.has(r.parentId) ? r.parentId : null
      if (p === parent) {
        out.push([r, depth])
        walk(r.id, depth + 1)
      }
    }
  }
  walk(null, 0)
  return out
}

// shares of [t0, t1]: waiting to start, active, ended
export function timelineParts(r: AgentRun, t0: number, t1: number): TimelineParts {
  const span = Math.max(1, t1 - t0)
  const pct = (t: number) => Math.round(((Math.min(Math.max(t, t0), t1) - t0) * 100) / span)
  const start = Math.min(pct(r.startedAt), 99)
  const end = Math.max(pct(r.endedAt ?? t1), start + 1)
  return { before: start, active: end - start, after: 100 - end }
}

function prune(runs: AgentRun[]): AgentRun[] {
  let drop = runs.length - MAX_RUNS
  return runs.filter(r => {
    if (drop > 0 && !isLive(r)) {
      drop -= 1
      return false
    }
    return true
  })
}

const patch = (runs: readonly AgentRun[], id: string, fn: (r: AgentRun) => AgentRun) =>
  runs.map(r => (r.id === id ? fn(r) : r))

export function spawned(runs: readonly AgentRun[], s: Spawn, now: number): AgentRun[] {
  const run: AgentRun = {
    id: s.id,
    parentId: s.parentId ?? null,
    type: s.type,
    description: s.description,
    model: s.model ?? null,
    effort: null,
    isTeammate: s.isTeammate === true,
    status: 'running',
    startedAt: now,
    endedAt: null,
    toolUses: 0,
    lastTool: null,
    requests: 0,
    contextTokens: 0,
    outputTokens: 0,
  }
  return prune([...runs.filter(r => r.id !== s.id), run])
}

export const resumed = (runs: readonly AgentRun[], id: string) =>
  patch(runs, id, r => (r.status === 'running' ? r : { ...r, status: 'running', endedAt: null }))

export const toolCalled = (runs: readonly AgentRun[], id: string, label: string) =>
  patch(runs, id, r => ({ ...r, status: 'running', endedAt: null, toolUses: r.toolUses + 1, lastTool: label }))

export const stepped = (
  runs: readonly AgentRun[],
  id: string,
  model: string,
  effort: string | number | undefined,
  usage: TurnUsage | null,
) =>
  patch(runs, id, r => ({
    ...r,
    model: usage?.model ?? model,
    effort: effort === undefined ? r.effort : String(effort),
    requests: r.requests + 1,
    contextTokens: usage
      ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : r.contextTokens,
    outputTokens: r.outputTokens + (usage?.output_tokens ?? 0),
  }))

export function completed(runs: readonly AgentRun[], id: string, reason: TurnCompleteReason, now: number): AgentRun[] {
  return patch(runs, id, r => {
    const status: RunStatus =
      reason === 'answer' ? (r.isTeammate ? 'idle' : 'done') : reason === 'aborted' ? 'stopped' : 'failed'
    return { ...r, status, endedAt: now }
  })
}

// the engine's word on loops still listed: waiting, idle, killed
export function listed(runs: readonly AgentRun[], infos: readonly AgentInfo[], now: number): AgentRun[] {
  const byId = new Map(infos.map(a => [a.id, FROM_LIST[a.status]]))
  return runs.map(r => {
    const status = byId.get(r.id)
    if (status === undefined || status === r.status || !isLive(r)) {
      return r
    }
    const next = { ...r, status }
    return isActive(next) ? { ...next, endedAt: null } : { ...next, endedAt: r.endedAt ?? now }
  })
}

export function counted(others: Others, id: string): Others {
  const loops = others.loops.includes(id) ? others.loops : [...others.loops, id].slice(-MAX_LOOPS)
  return { loops, requests: others.requests + 1 }
}
