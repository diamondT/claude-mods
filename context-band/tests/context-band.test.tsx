import { describe, expect, mock, test } from 'claude-code/testing'
import type { ContextCategory, SessionContextBreakdown, SessionUsage } from 'claude-code'

import { badgeColor, barRuns, formatTokens, percentOf, toSnapshot } from '../hooks/snapshot'

const category = (name: string, tokens: number, kind: ContextCategory['kind'] = 'used'): ContextCategory => ({
  name,
  tokens,
  color: 'inactive',
  isDeferred: kind === 'deferred',
  kind,
})

const breakdown: SessionContextBreakdown = {
  categories: [
    category('System prompt', 4200),
    category('System tools', 17000),
    category('MCP tools', 52000),
    category('MCP tools (deferred)', 5000, 'deferred'),
    category('Custom agents', 3400),
    category('Memory files', 8600),
    category('Skills', 5100),
    category('Messages', 0),
    category('Free space', 897000, 'free'),
    category('Autocompact buffer', 13000, 'buffer'),
  ],
  totalTokens: 90300,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  autocompactSource: 'auto',
  percentage: 9,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 987_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

const usage: SessionUsage = {
  startedAt: 0,
  context: { tokens: 90300, window: 1_000_000, percent: 9, breakdown },
  rateLimits: [],
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

describe('helpers', () => {
  test('formats tokens like the screenshot', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(850)).toBe('850')
    expect(formatTokens(4200)).toBe('4.2k')
    expect(formatTokens(4000)).toBe('4k')
    expect(formatTokens(17000)).toBe('17k')
    expect(formatTokens(897000)).toBe('897k')
    expect(formatTokens(999_700)).toBe('1M')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(1_500_000)).toBe('1.5M')
  })

  test('shows at least 1% for any tokens', () => {
    expect(percentOf(0, 1_000_000)).toBe(0)
    expect(percentOf(4200, 1_000_000)).toBe(1)
    expect(percentOf(17000, 1_000_000)).toBe(2)
    expect(percentOf(52000, 1_000_000)).toBe(5)
  })

  test('maps labels and palette, drops buffer and deferred', () => {
    const snapshot = toSnapshot(breakdown)

    expect(snapshot.segments.map(s => s.label)).toEqual([
      'system prompt',
      'tools',
      'mcp tools',
      'agents',
      'memory files',
      'skills',
      'messages',
      'free',
    ])
    expect(snapshot.segments[0]?.color).toBe('#5b84b1')
    expect(snapshot.segments[7]).toEqual({ label: 'free', tokens: 897000, color: '#3b4252', isFree: true })
    expect(snapshot).toMatchObject({ total: 90300, max: 1_000_000, percent: 9, compactsAt: 987_000 })
  })

  test('keeps unknown categories under their theme color', () => {
    const snapshot = toSnapshot({ ...breakdown, categories: [category('Plugin things', 10)] })

    expect(snapshot.segments).toEqual([{ label: 'plugin things', tokens: 10, color: 'inactive', isFree: false }])
  })

  test('has no compaction point when auto-compact is off', () => {
    expect(toSnapshot({ ...breakdown, isAutoCompactEnabled: false }).compactsAt).toBe(null)
  })

  test('colors the badge by distance to compaction', () => {
    const at = (total: number) => badgeColor({ ...toSnapshot(breakdown), total })

    expect(at(493_500)).toBe('success')
    expect(at(789_600)).toBe('warning')
    expect(at(937_650)).toBe('error')
  })

  test('fills the bar to its width', () => {
    const runs = barRuns(toSnapshot(breakdown), 100, '▄')
    const cells = runs.map(r => r.text).join('')

    expect([...cells]).toHaveLength(100)
    expect(cells).not.toContain('│')
    expect(runs.find(r => r.color === '#5b84b1')?.text).toBe('▄')
    expect(runs.some(r => r.color === '#d9693f')).toBe(false)
  })
})

test('draws the band from the measured breakdown', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  await $.session.measure({ context: usage.context, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /^90k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / of 1M · compacts at 987k / })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ 9% $/ }))?.props.backgroundColor).toBe('success')
    expect(await ui.find({ type: 'Text', text: / mcp tools 52k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / free 897k$/ })).toBeDefined()
    expect(await ui.find({ key: 'engine' })).toBeUndefined()
    await ui.unmount()
  }
})

test('yields the band to a survey and to a subagent view', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  await $.session.measure({ context: usage.context, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const props of [{ ...BAND.props, hasSurvey: true }, { ...BAND.props, view: { agentId: 'a1' } }]) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, component: 'AbovePrompt', props })

      expect(await ui.find({ key: 'engine' })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('refreshes once per throttle window as rows are appended', async ($, on) => {
  const clock = mock.clock(on)
  let calls = 0
  on('session.usage', () => {
    calls += 1
    return { value: usage }
  })
  // kit has no store beneath session.append; only a note row may be answered without next
  on('session.append', () => ({ deny: 'kept by the test' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  for (const uuid of ['u1', 'u2']) {
    await $.session.append({
      message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: 'hi' }] },
      door: 'note',
      origin: { kind: 'plugin', name: 'test' },
      uuid,
    })
  }
  expect(calls).toBe(0)

  await clock.advance(750)
  expect(calls).toBe(1)

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'engine' })).toBeUndefined()
  await ui.unmount()
})
