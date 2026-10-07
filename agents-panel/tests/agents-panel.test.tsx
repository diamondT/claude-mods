import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, On, TurnUsage } from 'claude-code'

import type { AgentRun } from '../types'
import {
  C,
  MAX_RUNS,
  cardStats,
  completed,
  connector,
  counted,
  effortCells,
  formatClock,
  headline,
  legend,
  listed,
  mark,
  modelName,
  ordered,
  othersLine,
  resumed,
  spawned,
  stepped,
  timelineParts,
  title,
  toolCalled,
  toolLabel,
  typeColor,
} from '../hooks/agents'

const usage = (input: number, output: number): TurnUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 50_000,
  cache_creation_input_tokens: 10_000,
  model: 'claude-haiku-4-5-20251001',
})

const run = (id: string, over: Partial<AgentRun> = {}): AgentRun => ({
  ...spawned([], { id, type: 'Explore', description: `task ${id}` }, 1000)[0]!,
  ...over,
})

const joined = (pieces: readonly { text: string }[]) => pieces.map(p => p.text).join('')

const spawnInput = (description: string, over: Partial<AgentSpawnInput> = {}): AgentSpawnInput => ({
  tool_use_id: `tu-${description}`,
  prompt: description,
  description,
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...over,
})

const PANE_PROPS = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
} as const

const pane = (agentId?: string) =>
  ({
    component: 'Pane',
    requestId: 'agents',
    props: { ...PANE_PROPS, view: agentId === undefined ? {} : { agentId } },
  }) as const

function engine(on: On, opened: string[] = []) {
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: `a${++n}` }))
  on('agent.list', () => ({ value: [] }))
  on('ui.panes', () => ({
    value: opened.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: usage(2000, 540) }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return opened
}

describe('helpers', () => {
  test('formats durations as a clock', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(24_900)).toBe('0:24')
    expect(formatClock(72_000)).toBe('1:12')
    expect(formatClock(3_723_000)).toBe('1:02:03')
  })

  test('labels a tool by its leading argument', () => {
    expect(toolLabel('Bash', { command: 'npm test -- parser', description: 'run tests' })).toBe('Bash(npm test -- parser)')
    expect(toolLabel('Grep', { pattern: 'parse\\(', path: 'src' })).toBe('Grep(parse\\()')
    expect(toolLabel('Read', { file_path: '/srv/a.ts' })).toBe('Read(/srv/a.ts)')
    expect(toolLabel('TodoWrite', { todos: [] })).toBe('TodoWrite')
    expect(toolLabel('Bash', { command: 'a\n  b' })).toBe('Bash(a b)')
    expect(toolLabel('Bash', { command: 'x'.repeat(200) })).toHaveLength('Bash()'.length + 80)
  })

  test('names models', () => {
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  })

  test('colors agent types from the flightdeck palette', () => {
    expect(typeColor('general-purpose')).toBe(C.coral)
    expect(typeColor('Explore')).toBe(C.lavender)
    expect(typeColor('Plan')).toBe(C.green)
    expect([C.purple, C.teal, C.amber]).toContain(typeColor('fork'))
    expect(typeColor('fork')).toBe(typeColor('fork'))
  })

  test('marks a run by its state', () => {
    expect(mark(run('a', { type: 'Plan' }))).toEqual({ glyph: '●', color: C.green })
    expect(mark(run('a', { status: 'waiting' }))).toEqual({ glyph: '◌', color: C.dim })
    expect(mark(run('a', { status: 'done' }))).toEqual({ glyph: '✓', color: C.green })
    expect(mark(run('a', { status: 'failed' }))).toEqual({ glyph: '✗', color: C.red })
    expect(mark(run('a', { status: 'stopped' }))).toEqual({ glyph: '■', color: C.amber })
  })

  test('fills effort cells by level', () => {
    expect(effortCells('medium')).toEqual({ filled: 2, total: 5 })
    expect(effortCells('max')).toEqual({ filled: 5, total: 5 })
    expect(effortCells('8000')).toBe(null)
    expect(effortCells(null)).toBe(null)
  })

  test('titles the panel with the counts that are not zero', () => {
    const runs = [
      run('a'),
      run('b', { status: 'idle' }),
      run('c', { status: 'done' }),
      run('d', { status: 'done' }),
      run('e', { status: 'failed' }),
    ]
    expect(joined(title(runs))).toBe('AGENTS · 1 WORKING · 1 WAITING · 2 DONE · 1 FAILED')
    expect(joined(title([]))).toBe('AGENTS')
    expect(title(runs)[2]).toEqual({ text: '1 WORKING', color: C.coral, bold: true })
  })

  test('lists each agent type once, in spawn order', () => {
    const runs = [run('a', { type: 'Plan' }), run('b'), run('c', { type: 'Plan' })]
    expect(legend(runs)).toEqual([
      { text: 'Plan', color: C.green },
      { text: 'Explore', color: C.lavender },
    ])
  })

  test('counts running and total, and the forks', () => {
    expect(headline([run('a'), run('b', { status: 'waiting' }), run('c', { status: 'done' })])).toBe(
      'agents · 2 running · 3 total',
    )
    const others = counted(counted(counted({ loops: [], requests: 0 }, 'f1'), 'f1'), 'f2')
    expect(others).toEqual({ loops: ['f1', 'f2'], requests: 3 })
    expect(othersLine(others)).toBe('2 forks · 3 req')
    expect(othersLine({ loops: [], requests: 0 })).toBe(null)
  })

  test('states what a card shows', () => {
    const r = run('a', { model: 'claude-opus-5-5', toolUses: 9, requests: 12, startedAt: 0 })
    expect(cardStats(r, 40_000).map(s => `${s.label} ${s.value}`)).toEqual([
      'model Opus 5.5',
      'tools 9',
      'req 12',
      'for 0:40',
    ])
    expect(cardStats({ ...r, model: null, contextTokens: 57_000, outputTokens: 3600 }, 40_000).map(s => s.label)).toEqual([
      'tools',
      'req',
      'ctx',
      'out',
      'for',
    ])
  })

  test('draws a connector with three dots across the width', () => {
    const pieces = connector(20, C.purple)
    expect(joined(pieces)).toBe('╌╌╌●╌╌╌╌╌╌●╌╌╌╌╌●╌╌╌')
    expect(pieces.filter(p => p.text === '●').every(p => p.color === C.purple)).toBe(true)
    expect(joined(connector(1, C.purple))).toBe('●●●')
  })

  test('nests children under their parent in spawn order', () => {
    const runs = [run('a'), run('b'), run('c', { parentId: 'a' }), run('d', { parentId: 'gone' })]
    expect(ordered(runs).map(([r, depth]) => `${r.id}${depth}`)).toEqual(['a0', 'c1', 'b0', 'd0'])
  })

  test('splits the timeline into before, active and after', () => {
    expect(timelineParts(run('a', { startedAt: 0, endedAt: 50 }), 0, 100)).toEqual({ before: 0, active: 50, after: 50 })
    expect(timelineParts(run('a', { startedAt: 75, endedAt: null }), 0, 100)).toEqual({ before: 75, active: 25, after: 0 })
    expect(timelineParts(run('a', { startedAt: 100, endedAt: null }), 0, 100)).toEqual({ before: 99, active: 1, after: 0 })
    expect(timelineParts(run('a', { startedAt: 5, endedAt: 5 }), 5, 5)).toEqual({ before: 0, active: 1, after: 99 })
  })

  test('tracks a run from spawn to completion', () => {
    let runs = spawned([], { id: 'a', parentId: 'p', type: 'Plan', description: 'Draft', model: 'claude-sonnet-5-5' }, 1000)
    expect(runs[0]).toMatchObject({ id: 'a', parentId: 'p', status: 'running', startedAt: 1000, requests: 0, effort: null })

    runs = toolCalled(runs, 'a', 'Read(a.ts)')
    runs = toolCalled(runs, 'a', 'Grep(x)')
    runs = stepped(runs, 'a', 'claude-sonnet-5-5', 'high', usage(2000, 540))
    runs = stepped(runs, 'a', 'claude-sonnet-5-5', undefined, usage(3000, 100))
    expect(runs[0]).toMatchObject({
      toolUses: 2,
      lastTool: 'Grep(x)',
      requests: 2,
      effort: 'high',
      contextTokens: 63_000,
      outputTokens: 640,
      model: 'claude-haiku-4-5-20251001',
    })

    expect(completed(runs, 'a', 'answer', 5000)[0]).toMatchObject({ status: 'done', endedAt: 5000 })
    expect(completed(runs, 'a', 'aborted', 5000)[0]?.status).toBe('stopped')
    expect(completed(runs, 'a', 'error', 5000)[0]?.status).toBe('failed')
    expect(completed([run('t', { isTeammate: true })], 't', 'answer', 5000)[0]?.status).toBe('idle')
    expect(resumed(completed(runs, 'a', 'answer', 5000), 'a')[0]).toMatchObject({ status: 'running', endedAt: null })
  })

  test('takes the engine list on live runs only', () => {
    const info = (id: string, status: 'waiting' | 'killed' | 'running') => ({ id, description: '', type: 'Explore', status })
    const runs = [run('a'), run('b'), run('c', { status: 'done', endedAt: 2000 })]
    const out = listed(runs, [info('a', 'waiting'), info('b', 'killed'), info('c', 'running')], 3000)
    expect(out.map(r => [r.status, r.endedAt])).toEqual([
      ['waiting', null],
      ['stopped', 3000],
      ['done', 2000],
    ])
  })

  test('keeps the newest finished runs past the cap, live ones always', () => {
    let runs = [run('live'), ...Array.from({ length: MAX_RUNS - 1 }, (_, i) => run(`d${i}`, { status: 'done' }))]
    runs = spawned(runs, { id: 'new', type: 'Explore', description: 'new' }, 2000)
    expect(runs).toHaveLength(MAX_RUNS)
    expect(runs.map(r => r.id)).toEqual(['live', ...Array.from({ length: MAX_RUNS - 2 }, (_, i) => `d${i + 1}`), 'new'])
  })
})

test('draws a card per working agent and every agent on the timeline', async ($, on) => {
  const clock = mock.clock(on, { now: 100_000 })
  const opened = engine(on)

  await $.agent.spawn(spawnInput('Draft the migration', { subagentType: 'Plan' }))
  await clock.advance(10_000)
  await $.agent.spawn(spawnInput('Find every caller of parse()'))
  expect(opened).toEqual(['agents'])

  for (const id of ['a1', 'a2']) {
    const stream = $.turn.step({
      turnId: `t-${id}`,
      index: 0,
      model: 'claude-haiku-4-5-20251001',
      effort: 'high',
      messageCount: 1,
      agentId: id,
    })
    for await (const _ of stream) {
      // drained
    }
  }
  await $.turn.complete({
    answer: 'plan',
    durationMs: 10_000,
    isAborted: false,
    turnId: 't-a1',
    agentId: 'a1',
    reason: 'answer',
  })
  await clock.advance(14_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-panel', surface, ...pane('a2') })

    expect(await ui.find({ type: 'Text', text: /^AGENTS · 1 WORKING · 1 DONE$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^■ Plan$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^■ Explore$/ })).toBeDefined()

    // the finished agent has no card; the one in view a bold border
    expect(await ui.find({ key: 'card:a1' })).toBeUndefined()
    expect((await ui.find({ key: 'card:a2' }))?.props).toMatchObject({ borderStyle: 'bold', borderColor: C.lavender })
    expect(await ui.find({ type: 'Text', text: /^EXPLORE · Find every caller of parse\(\)$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '● working' }))?.props.color).toBe(C.lavender)
    expect(await ui.find({ type: 'Text', text: /^└ starting…$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^effort ▮▮▮▯▯ high$/ })).toBeDefined()
    for (const stat of ['model Haiku 4.5', 'tools 0', 'req 1', 'ctx 62k', 'out 540', 'for 0:14']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${stat}$`) }), stat).toBeDefined()
    }

    expect(await ui.find({ type: 'Text', text: /^agents · 1 running · 2 total$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1: Draft the migration$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^2: Find every caller of parse\(\)$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^✓$/ }))?.props.color).toBe(C.green)
    expect(await ui.find({ type: 'Text', text: /^0:10$/ })).toBeDefined()
    // of 24s: a1 ran the first 10s, a2 the last 14s
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('"width":"42%"')
    expect(drawn).toContain('"width":"58%"')
    expect(drawn).toContain('"paddingX":1')
    await ui.unmount()
  }
})

test('shows the latest tool call and links the cards', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  on('tool.call', () => ({ result: 'ok' }) as never)

  await $.agent.spawn(spawnInput('Refactor the parser', { subagentType: 'general-purpose' }))
  for (const command of ['ls', 'npm test -- parser']) {
    await $.tool.call({ tool: 'Bash', command, agentId: 'a1' } as never)
  }
  await $.tool.call({ tool: 'Bash', command: 'whoami' } as never)
  await $.agent.spawn(spawnInput('Draft the migration', { subagentType: 'Plan' }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-panel', surface, ...pane() })
    expect(await ui.find({ type: 'Text', text: /^└ Bash\(npm test -- parser\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^tools 2$/ })).toBeDefined()
    expect((await ui.find({ key: 'card:a1' }))?.props).toMatchObject({ borderStyle: 'round', borderColor: C.coral })
    // one connector, between the two cards, dotted in the second card's color
    const links = await ui.findAll({ type: 'Text', text: /^╌+●╌+●╌+●╌+$/ })
    expect(links).toHaveLength(1)
    expect(JSON.stringify(links[0])).toContain(C.green)
    await ui.unmount()
  }
})

test('opens on the first spawn, the command toggles it', async ($, on) => {
  mock.clock(on)
  const opened = engine(on)
  on('ui.close', (_$, e) => {
    opened.splice(opened.indexOf(e.id), 1)
    return { value: undefined }
  })
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)

  await $.session.start({ cwd: '/srv', surface: 'terminal', isInteractive: true } as never)
  await $.agent.spawn(spawnInput('one'))
  await $.agent.spawn(spawnInput('two'))
  expect(opened).toEqual(['agents'])

  const run = () => $.command.run({ command: 'agents-panel', args: '' } as never)
  expect(await run()).toMatchObject({ text: 'Agents panel closed.' })
  expect(opened).toEqual([])
  expect(await run()).toMatchObject({ text: 'Agents panel opened.' })
  expect(opened).toEqual(['agents'])
})

test('says so with no agents yet', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-panel', surface, ...pane() })
    expect(await ui.find({ type: 'Text', text: /^AGENTS$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'No agents yet.' })).toBeDefined()
    await ui.unmount()
  }
})
