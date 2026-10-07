import type { Git, Line } from '../types'

export type Run = { text: string; color?: string; dim?: boolean; bold?: boolean }

export type Mode = { label: string; color: string }

// catppuccin mocha
const C = {
  red: '#f38ba8',
  yellow: '#e5c890', // frappé; mocha's is too bright
  green: '#a6e3a1',
  blue: '#89b4fa',
  mauve: '#cba6f7',
  teal: '#94e2d5',
  overlay: '#6c7086',
  subtext: '#a6adc8',
}

// emoji presentation, so the layout counts the 2 cells the terminal draws
const PAUSE = '⏸\uFE0F'
const STOPWATCH = '⏱\uFE0F'

const MODE_HINT = /^([⏵⏸]+)[\uFE0E\uFE0F]?\s*(.+?) on\b/
const MODE_COLORS: Record<string, string> = {
  'manual mode': C.subtext,
  'accept edits': C.mauve,
  'plan mode': C.teal,
  'auto mode': C.yellow,
  'bypass permissions': C.red,
  "don't ask": C.red,
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

export function shortPath(cwd: string, home: string | undefined): string {
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd
}

export function modeOf(hint: string): Mode | null {
  const m = MODE_HINT.exec(hint.trim())
  if (!m) {
    return null
  }
  const [, glyph = '', name = ''] = m
  return { label: `${glyph === '⏸' ? PAUSE : glyph} ${name} on`, color: MODE_COLORS[name] ?? C.yellow }
}

export const left = (used: number) => Math.max(0, Math.round(100 - used))

export function bar(pct: number, width = 10): string {
  const filled = Math.floor((Math.min(100, Math.max(0, pct)) * width) / 100)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const leftColor = (v: number) => (v <= 20 ? C.red : v <= 50 ? C.yellow : C.green)

export function parseGit(porcelain: string): Omit<Git, 'state'> {
  const git = {
    branch: '',
    ahead: 0,
    behind: 0,
    conflicted: 0,
    stashed: 0,
    deleted: 0,
    renamed: 0,
    modified: 0,
    staged: 0,
    untracked: 0,
  }
  let oid = ''

  for (const row of porcelain.split('\n')) {
    const [kind, a = '', b = '', c = ''] = row.split(' ')
    if (kind === '#') {
      if (a === 'branch.oid') {
        oid = b
      } else if (a === 'branch.head') {
        git.branch = b
      } else if (a === 'branch.ab') {
        git.ahead = Number(b.slice(1))
        git.behind = Number(c.slice(1))
      } else if (a === 'stash') {
        git.stashed = Number(b)
      }
    } else if (kind === '1' || kind === '2') {
      // a is XY: index then worktree, '.' unchanged (starship's counting)
      git.renamed += kind === '2' ? 1 : 0
      git.deleted += a.includes('D') ? 1 : 0
      git.modified += a[1] === 'M' || a[1] === 'A' ? 1 : 0
      git.staged += a[0] === 'M' || a[0] === 'A' ? 1 : 0
    } else if (kind === 'u') {
      git.conflicted += 1
    } else if (kind === '?') {
      git.untracked += 1
    }
  }

  if (git.branch === '(detached)') {
    git.branch = oid.slice(0, 7)
  }
  return git
}

function gitRuns(g: Git): Run[] {
  const out: Run[] = []
  if (g.state) {
    out.push({ text: `${g.state} `, color: C.red, bold: true })
  }

  const aheadBehind =
    g.ahead && g.behind ? `⇡${g.ahead}⇣${g.behind}` : g.ahead ? `⇡${g.ahead}` : g.behind ? `⇣${g.behind}` : ''
  if (aheadBehind) {
    out.push({ text: aheadBehind, color: C.teal })
  }
  if (g.conflicted) {
    out.push({ text: `~${g.conflicted}`, color: C.red })
  }

  const counts: [string, number][] = [
    ['≡', g.stashed],
    ['✘', g.deleted],
    ['»', g.renamed],
    ['!', g.modified],
    ['+', g.staged],
    ['?', g.untracked],
  ]
  const rest = counts
    .filter(([, n]) => n > 0)
    .map(([symbol, n]) => `${symbol}${n}`)
    .join('')
  if (rest) {
    out.push({ text: rest, color: C.yellow })
  }

  return out.length ? [{ text: ' ' }, ...out] : []
}

export function runs(line: Line, mode: Mode | null = null): Run[] {
  const sections: Run[][] = []

  if (mode) {
    sections.push([{ text: mode.label, color: mode.color }])
  }

  if (line.model) {
    sections.push([{ text: `🧠 ${line.model}${line.effort ? ` ·${line.effort}` : ''}`, dim: true }])
  }

  if (line.limits) {
    const { fiveLeft, fiveReset, sevenLeft } = line.limits
    const reset = fiveReset ? ` ${STOPWATCH} ${fiveReset}` : ''
    const section: Run[] = [{ text: `🔋 ${bar(fiveLeft)} ${fiveLeft}%${reset}`, color: leftColor(fiveLeft) }]
    if (sevenLeft !== null) {
      section.push({ text: ' //', color: C.overlay }, { text: ` 7d ${sevenLeft}%`, color: C.teal })
    }
    sections.push(section)
  }

  if (line.cwd !== null) {
    sections.push([{ text: `📁 ${line.cwd}`, color: C.blue }])
  }

  if (line.git) {
    sections.push([{ text: `🌿 ${line.git.branch}`, color: C.mauve }, ...gitRuns(line.git)])
  }

  return sections.flatMap((section, i) => (i === 0 ? section : [{ text: ' │ ', dim: true }, ...section]))
}
