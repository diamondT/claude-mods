import type { Git, Line } from '../types'

export type Run = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }

// catppuccin mocha
const C = {
  red: '#f38ba8',
  peach: '#fab387',
  yellow: '#e5c890', // frappé; mocha's is too bright
  green: '#a6e3a1',
  blue: '#89b4fa',
  mauve: '#cba6f7',
  teal: '#94e2d5',
  text: '#cdd6f4',
  overlay1: '#7f849c',
  surface2: '#585b70',
}

// 20% accent over mocha base
const TINT = { green: '#394545', mauve: '#413956' }

// Nerd Font: powerline half circles, nf-fa
const CAP_L = '\uE0B6'
const CAP_R = '\uE0B4'
const GAUGE = '\uF0E4'
const CALENDAR = '\uF073'
const HISTORY = '\uF1DA'

const METER_CELLS = 8
const SEP: Run = { text: ' │ ', color: C.surface2 }

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

export const left = (used: number) => Math.max(0, Math.round(100 - used))

const severity = (v: number) => (v <= 20 ? C.red : v <= 50 ? C.peach : C.green)

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

function pill(bg: string, body: Run[]): Run[] {
  return [{ text: CAP_L, color: bg }, ...body.map(r => ({ color: C.text, ...r, bg })), { text: CAP_R, color: bg }]
}

const icon = (glyph: string, color: string): Run => ({ text: `${glyph} `, color })

// whole cells: a partial one shows the pill's background between fill and shade
function meter(pct: number): Run[] {
  const full = Math.round((Math.min(100, Math.max(0, pct)) / 100) * METER_CELLS)
  return [
    { text: '█'.repeat(full), color: severity(pct) },
    { text: '░'.repeat(METER_CELLS - full), color: C.surface2 },
  ]
}

function quotaPill(glyph: string, label: string, accent: string, bg: string, pct: number, reset: Run[]): Run[] {
  return pill(bg, [
    icon(glyph, accent),
    { text: `${label} ` },
    ...meter(pct),
    { text: ` ${pct}%`, bold: true, color: pct <= 20 ? C.red : C.text },
    { text: ' left', color: C.overlay1 },
    ...reset,
  ])
}

export type Legend = { quota: Run[][]; cwd: Run[] | null; git: Run[] | null }

// legend items: quota row, then directory and git row
export function legend(line: Line): Legend {
  const quota: Run[][] = []

  if (line.limits) {
    const { fiveLeft, fiveReset, sevenLeft } = line.limits
    const reset = fiveReset ? [SEP, icon(HISTORY, C.green), { text: `→ ${fiveReset}`, color: C.overlay1 }] : []
    quota.push(quotaPill(GAUGE, '5h', C.green, TINT.green, fiveLeft, reset))
    if (sevenLeft !== null) {
      quota.push(quotaPill(CALENDAR, '7d', C.mauve, TINT.mauve, sevenLeft, []))
    }
  }

  return {
    quota,
    cwd: line.cwd === null ? null : [{ text: line.cwd, color: C.blue }],
    git: line.git ? [{ text: `🌿 ${line.git.branch}`, color: C.mauve }, ...gitRuns(line.git)] : null,
  }
}
