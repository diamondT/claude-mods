import type { Git, Limits, Line } from '../types'

export type Run = { text: string; color?: string; dim?: boolean; bold?: boolean }

export type QuotaRow = { fill: string; percent: number; color: string }

// catppuccin mocha
const C = {
  red: '#f38ba8',
  yellow: '#e5c890', // frappé; mocha's is too bright
  green: '#a6e3a1',
  blue: '#89b4fa',
  mauve: '#cba6f7',
  teal: '#94e2d5',
}

export const BAR_EMPTY = '#3b4252' // context-band's free space

// emoji presentation, so the layout counts the 2 cells the terminal draws
const STOPWATCH = '⏱\uFE0F'

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

// half blocks over two rows: one thick bar, 5h on top of 7d
export function quotaRows({ fiveLeft, sevenLeft }: Limits): QuotaRow[] {
  const five = { percent: fiveLeft, color: leftColor(fiveLeft) }
  const seven = sevenLeft === null ? five : { percent: sevenLeft, color: C.mauve }
  return [
    { fill: '▄', ...five },
    { fill: '▀', ...seven },
  ]
}

// legend rows: quota, then directory and git
export function legend(line: Line): Run[][][] {
  const quota: Run[][] = []
  const place: Run[][] = []

  if (line.limits) {
    const { fiveLeft, fiveReset, sevenLeft } = line.limits
    quota.push([
      { text: '■', color: leftColor(fiveLeft) },
      { text: ' 5h ' },
      { text: `${fiveLeft}%`, bold: true },
      { text: ' left', dim: true },
      ...(fiveReset ? [{ text: ` ${STOPWATCH} ${fiveReset}`, dim: true }] : []),
    ])
    if (sevenLeft !== null) {
      quota.push([
        { text: '■', color: C.mauve },
        { text: ' 7d ' },
        { text: `${sevenLeft}%`, bold: true },
        { text: ' left', dim: true },
      ])
    }
  }

  if (line.cwd !== null) {
    place.push([{ text: line.cwd, color: C.blue }])
  }

  if (line.git) {
    place.push([{ text: `🌿 ${line.git.branch}`, color: C.mauve }, ...gitRuns(line.git)])
  }

  return [quota, place].filter(row => row.length > 0)
}
