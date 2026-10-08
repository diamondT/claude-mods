import { describe, expect, mock, test } from 'claude-code/testing'
import type { ProcessRunResult, SessionUsage } from 'claude-code'

import { legend, modelName, parseGit, shortPath } from '../hooks/line'
import type { Run } from '../hooks/line'

const PORCELAIN = [
  '# branch.oid 0123456789abcdef',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '# stash 3',
  '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
  '1 M. N... 100644 100644 100644 aaa bbb src/b.ts',
  '1 MM N... 100644 100644 100644 aaa bbb src/c.ts',
  '1 D. N... 100644 000000 000000 aaa bbb src/d.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 src/e.ts\tsrc/old.ts',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc src/f.ts',
  '? notes.md',
  '? tmp/',
].join('\n')

const ran = (stdout: string, exitCode = 0): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const seg = (n: number) => '\uE0BA\uE0BC'.repeat(n)

const usage: SessionUsage = {
  startedAt: 0,
  context: { tokens: 152_000, window: 1_000_000, percent: 15 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 36, resetsAt: '2026-10-07T15:00:00Z' },
    { kind: 'seven_day', percentUsed: 58, resetsAt: '2026-10-12T15:00:00Z' },
  ],
}

const hintProps = (hint: string) =>
  ({ component: 'PromptHint', props: { isDraft: false, isWorking: false, hint } }) as const
const HINT = hintProps('? for shortcuts')

describe('helpers', () => {
  test('names models as the status line did', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelName('claude-fable-5-1[1m]')).toBe('Fable 5.1 (1M context)')
    expect(modelName('opus')).toBe('Opus')
  })

  test('shortens home only at a path boundary', () => {
    expect(shortPath('/home/me/dev', '/home/me')).toBe('~/dev')
    expect(shortPath('/home/me', '/home/me')).toBe('~')
    expect(shortPath('/home/meow', '/home/me')).toBe('/home/meow')
    expect(shortPath('/srv', undefined)).toBe('/srv')
  })

  test('counts git status as starship did', () => {
    expect(parseGit(PORCELAIN)).toEqual({
      branch: 'main',
      ahead: 2,
      behind: 1,
      conflicted: 1,
      stashed: 3,
      deleted: 1,
      renamed: 1,
      modified: 2,
      staged: 2,
      untracked: 2,
    })
    expect(parseGit('# branch.oid 0123456789abcdef\n# branch.head (detached)').branch).toBe('0123456')
  })

  test('lists the legend in rows, skipping what is unknown', () => {
    const { quota, cwd, git } = legend({
      model: 'Opus 5.5',
      effort: 'xhigh',
      limits: { fiveLeft: 64, fiveReset: '18:00', sevenLeft: 42, sevenReset: 'Mon 18:00' },
      cwd: '~/dev',
      git: { ...parseGit(PORCELAIN), state: 'REBASE 2/5' },
    })
    const text = (item: Run[] | null) => item?.map(r => r.text).join('')

    expect(quota.map(text)).toEqual([
      `█\uF0E4 5h ${seg(5)} 64% left │ \uF1DA → 18:00█`,
      `█\uF073 7d ${seg(5)} 42% left │ \uF1DA → Mon 18:00█`,
    ])
    expect(quota[0]?.[0]).toEqual({ text: '█', color: '#394545' })
    expect(quota[0]?.find(r => r.text === seg(3))).toEqual({ text: seg(3), color: '#a6e3a1', bg: '#394545' })
    expect(quota[1]?.find(r => r.text === seg(2))).toEqual({ text: seg(2), color: '#fab387', bg: '#413956' })
    const low = legend({ model: null, effort: null, limits: { fiveLeft: 15, fiveReset: null, sevenLeft: null, sevenReset: null }, cwd: null, git: null })
    expect(low.quota.map(text)).toEqual([`█\uF0E4 5h ${seg(5)} 15% left█`])
    expect(text(cwd)).toBe('~/dev')
    expect(text(git)).toBe('🌿 main REBASE 2/5 ⇡2⇣1~1≡3✘1»1!2+2?2')
    expect(legend({ model: 'Opus 5.5', effort: null, limits: null, cwd: '/srv', git: null })).toEqual({
      quota: [],
      cwd: [{ text: '/srv', color: '#89b4fa' }],
      git: null,
    })
  })
})

test('draws a box in place of the engine hint', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({
    value: { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } },
  }))
  on('session.usage', () => ({ value: usage }))
  on('session.cwd', () => ({ value: '/home/me/dev' }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_$, e) => {
    const [cmd, ...args] = e.argv
    if (cmd === 'date') {
      return { value: ran(args.at(-1) === '+%a %H:%M' ? 'Mon 18:00\n' : '18:00\n') }
    }
    return { value: ran(args.includes('status') ? PORCELAIN : '/home/me/dev/.git\n') }
  })
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'engine', ref: 1 }))

  await $.session.start({ cwd: '/home/me/dev', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'status-line',
      surface,
      ...hintProps('(shift+tab to cycle) · ← for agents'),
    })

    expect(await ui.find({ type: 'Text', text: /for agents|shift\+tab/ })).toBeUndefined()
    // grows to the hint row, not the viewport: narrower beside a docked pane
    expect(await ui.drawn()).toMatchObject({
      props: { key: 'prompt-row', flexGrow: 1 },
      children: [{ props: { key: 'prompt-row:panels' } }, { type: 'engine', ref: 1 }],
    })
    expect((await ui.find({ key: 'prompt-row:panels' }))?.props.width).toBeUndefined()
    expect((await ui.find({ key: 'status-line' }))?.props).toMatchObject({ borderStyle: 'round', width: '50%' })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' · xhigh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^█\uF0E4 5h (\uE0BA\uE0BC){5} 64% left │ \uF1DA → 18:00█$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^█\uF073 7d (\uE0BA\uE0BC){5} 42% left │ \uF1DA → Mon 18:00█$/ })).toBeDefined()
    const drawn = JSON.stringify(await ui.drawn())
    // the pills' own, no separators between sections: half blocks only as the pills' edges
    expect(drawn.split('│')).toHaveLength(3)
    expect(drawn.match(/▄+/g)?.map(edge => edge.length)).toEqual([38, 42])
    expect(drawn.match(/▀+/g)?.map(edge => edge.length)).toEqual([38, 42])
    expect((await ui.find({ type: 'Text', text: /^~\/dev$/ }))?.props).toMatchObject({ wrap: 'truncate-start' })
    expect(drawn).toContain('"minWidth":"50%"')
    expect(await ui.find({ type: 'Text', text: /^🌿 main$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('follows the model of the main loop', async ($, on) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'opus' }))
  on('settings.read', () => ({ value: {} }))
  on('session.usage', () => ({ value: { ...usage, rateLimits: [] } }))
  on('session.cwd', () => ({ value: '/srv' }))
  on('process.run', () => ({ value: ran('', 128) }))
  on('classic.PostModelSwitch', () => ({}))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  await $.session.start({ cwd: '/srv', surface: 'terminal', isInteractive: true })
  const before = await $.ui.mount({ plugin: 'status-line', surface: 'terminal', ...HINT })
  expect(await before.find({ type: 'Text', text: 'Opus' })).toBeDefined()
  expect(await before.find({ type: 'Text', text: /🌿/ })).toBeUndefined()
  expect(await before.find({ type: 'Text', text: /for shortcuts/ })).toBeUndefined()
  await before.unmount()

  await $.classic.PostModelSwitch({
    from_model: 'claude-opus-5-5',
    to_model: 'claude-haiku-4-5-20251001',
    requested_model: 'haiku',
    source: 'command',
  } as never)
  const after = await $.ui.mount({ plugin: 'status-line', surface: 'terminal', ...HINT })
  expect(await after.find({ type: 'Text', text: 'Haiku 4.5' })).toBeDefined()
  await after.unmount()
})

test('reads the reset time with BSD date where GNU date fails', async ($, on) => {
  const calls: string[][] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({ value: {} }))
  on('session.usage', () => ({
    value: { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 36, resetsAt: '2026-10-07T16:30:00Z' }] },
  }))
  on('session.cwd', () => ({ value: '/srv' }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_$, e) => {
    const [cmd, flag] = e.argv
    if (cmd !== 'date') {
      return { value: ran('', 128) }
    }
    calls.push([...e.argv])
    expect(e.init?.env).toEqual({ LC_ALL: 'C' })
    return { value: flag === '-r' ? ran('19:30\n') : ran('', 1) }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  await $.session.start({ cwd: '/srv', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'status-line', surface: 'terminal', ...HINT })

  expect(calls).toEqual([
    ['date', '-d', '@1791390600', '+%H:%M'],
    ['date', '-r', '1791390600', '+%H:%M'],
  ])
  expect(await ui.find({ type: 'Text', text: '→ 19:30' })).toBeDefined()
  await ui.unmount()
})

test("goes first in context-band's row", async ($, on) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({ value: {} }))
  on('session.usage', () => ({ value: { ...usage, rateLimits: [] } }))
  on('session.cwd', () => ({ value: '/srv' }))
  on('process.run', () => ({ value: ran('', 128) }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="prompt-row" flexDirection="column">
        <Box key="prompt-row:panels" columnGap={1}>
          <Box key="context-band">
            <Text>band</Text>
          </Box>
        </Box>
        <Box key="engine" />
      </Box>
    )
  })

  await $.session.start({ cwd: '/srv', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'status-line', surface, ...HINT })

    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect((await ui.find({ key: 'prompt-row:panels' }))?.children).toMatchObject([
      { props: { key: 'status-line' } },
      { props: { key: 'context-band' } },
    ])
    await ui.unmount()
  }
})
