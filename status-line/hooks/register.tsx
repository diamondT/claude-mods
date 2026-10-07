import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Settings, Timer } from 'claude-code'

import type { Git, Limits, Line } from '../types'
import { BAR_EMPTY, left, legend, modelName, parseGit, quotaRows, shortPath } from './line'
import { addPanel } from './row'

const EMPTY: Line = { model: null, effort: null, limits: null, cwd: null, git: null }
const line = atom({ plugin: 'status-line', key: 'line' } as const, EMPTY)

const REFRESH_MS = 300
const BAR_CELLS = 500 // wider than any row; clipped to the box
const GIT = ['git', '--no-optional-locks']
const MARKERS = [
  ['CHERRY_PICK_HEAD', 'CHERRY-PICK'],
  ['MERGE_HEAD', 'MERGE'],
  ['BISECT_LOG', 'BISECT'],
  ['REVERT_HEAD', 'REVERT'],
] as const

type Engine = EngineInterface

const patch = ($: Engine, p: Partial<Line>) => update($, line, prev => ({ ...prev, ...p }))

function effortOf(settings: Settings, model: string): string | null {
  const perModel = settings.modelSettings as Record<string, { effortLevel?: unknown }> | undefined
  const level = perModel?.[model]?.effortLevel ?? settings.effortLevel
  return typeof level === 'string' ? level : null
}

const resetTimes = new Map<string, string>()

async function clockTime($: Engine, iso: string): Promise<string | null> {
  const known = resetTimes.get(iso)
  if (known) {
    return known
  }
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return null
  }
  const epoch = Math.floor(ms / 1000)
  // local wall-clock time, as the shell's `date` has it: GNU, then BSD (macOS)
  for (const at of [['-d', `@${epoch}`], ['-r', `${epoch}`]]) {
    const { exitCode, stdout } = await $.process.run(['date', ...at, '+%H:%M'])
    if (exitCode === 0) {
      const time = stdout.trim()
      resetTimes.set(iso, time)
      return time
    }
  }
  return null
}

async function limitsOf($: Engine, rateLimits: readonly SessionRateLimit[]): Promise<Limits | null> {
  const five = rateLimits.find(r => r.kind === 'five_hour')
  if (!five) {
    return null
  }
  const seven = rateLimits.find(r => r.kind === 'seven_day')
  return {
    fiveLeft: left(five.percentUsed),
    fiveReset: five.resetsAt ? await clockTime($, five.resetsAt) : null,
    sevenLeft: seven ? left(seven.percentUsed) : null,
  }
}

const readTrimmed = ($: Engine, path: string) =>
  $.fs.read(path).then(
    text => (typeof text === 'string' ? text.trim() : ''),
    () => '',
  )

async function gitState($: Engine, dir: string): Promise<string | null> {
  const names = new Set((await $.fs.list(dir)).map(f => f.name))
  const progress = async (sub: string, at: string, of: string) => {
    const [n, total] = await Promise.all([readTrimmed($, `${dir}/${sub}/${at}`), readTrimmed($, `${dir}/${sub}/${of}`)])
    return n && total ? ` ${n}/${total}` : ''
  }

  if (names.has('rebase-apply')) {
    const inner = new Set((await $.fs.list(`${dir}/rebase-apply`)).map(f => f.name))
    if (inner.has('rebasing')) {
      return `REBASE${await progress('rebase-apply', 'next', 'last')}`
    }
    return inner.has('applying') ? 'AM' : 'AM/REBASE'
  }
  if (names.has('rebase-merge')) {
    return `REBASE${await progress('rebase-merge', 'msgnum', 'end')}`
  }
  return MARKERS.find(([file]) => names.has(file))?.[1] ?? null
}

async function gitOf($: Engine, cwd: string): Promise<Git | null> {
  const [status, dir] = await Promise.all([
    $.process.run([...GIT, '-C', cwd, 'status', '--porcelain=v2', '--branch', '--show-stash', '-uall']),
    $.process.run([...GIT, '-C', cwd, 'rev-parse', '--absolute-git-dir']),
  ])
  if (status.exitCode !== 0 || dir.exitCode !== 0) {
    return null
  }
  return { ...parseGit(status.stdout), state: await gitState($, dir.stdout.trim()) }
}

async function refreshPlace($: Engine) {
  const cwd = await $.session.cwd()
  const [home, git] = await Promise.all([$.env.get('HOME'), gitOf($, cwd)])
  await patch($, { cwd: shortPath(cwd, home), git })
}

let pending: Timer | undefined

function schedule($: Engine) {
  pending ??= $.clock.after(REFRESH_MS, async () => {
    pending = undefined
    await refreshPlace($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const [model, settings, usage] = await Promise.all([$.session.model(), $.settings.read(), $.session.usage()])
    await patch($, {
      model: modelName(model),
      effort: effortOf(settings, model),
      limits: await limitsOf($, usage.rateLimits),
    })
    await refreshPlace($)
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await patch($, { limits: await limitsOf($, e.rateLimits) })
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await patch($, { model: modelName(e.model), effort: e.effort === undefined ? null : String(e.effort) })
    }
    yield* next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await patch($, { model: modelName(e.to_model) })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    schedule($)
    return result
  })

  on('prompt.submit', ($, e, next) => {
    schedule($)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    schedule($)
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    const s = await read($, line)
    const rows = legend(s)
    if (!s.model && rows.length === 0) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const mine = (
      <Box
        key="status-line"
        width="50%"
        flexGrow={1}
        borderStyle="round"
        borderColor="subtle"
        paddingX={1}
        flexDirection="column"
      >
        {s.model ? (
          <Text>
            <Text bold>{s.model}</Text>
            {s.effort ? <Text dimColor>{` · ${s.effort}`}</Text> : null}
          </Text>
        ) : null}
        {s.limits
          ? quotaRows(s.limits).map(row => (
              <Box height={1} overflow="hidden">
                {row.percent > 0 ? (
                  <Box width={`${row.percent}%`} height={1} flexShrink={0} overflow="hidden">
                    <Text color={row.color}>{row.fill.repeat(BAR_CELLS)}</Text>
                  </Box>
                ) : null}
                {row.percent < 100 ? (
                  <Box flexGrow={1} height={1} overflow="hidden">
                    <Text color={BAR_EMPTY}>{row.fill.repeat(BAR_CELLS)}</Text>
                  </Box>
                ) : null}
              </Box>
            ))
          : null}
        {rows.map(row => (
          <Box flexWrap="wrap" columnGap={2}>
            {row.map(item => (
              <Text>
                {item.map(r => (
                  <Text color={r.color} dimColor={r.dim} bold={r.bold}>
                    {r.text}
                  </Text>
                ))}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
    return addPanel(below, mine, e.viewport?.columns, true)
  })
}
