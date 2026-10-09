import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AgentRun, Others } from '../types'
import {
  C,
  FRAME_MS,
  barParts,
  cardStats,
  completed,
  connector,
  counted,
  effortCells,
  elapsed,
  headline,
  isActive,
  isLive,
  listed,
  mark,
  ordered,
  othersLine,
  resumed,
  spawned,
  stateWord,
  stepped,
  title,
  toolCalled,
  toolLabel,
  tracked,
} from './agents'

const NO_OTHERS: Others = { loops: [], requests: 0 }
const runs = atom({ plugin: 'agents-panel', key: 'runs' } as const, [], { shape: 'v3' })
const others = atom({ plugin: 'agents-panel', key: 'others' } as const, NO_OTHERS)
const clock = atom({ plugin: 'agents-panel', key: 'now' } as const, 0)
const dismissed = atom({ plugin: 'agents-panel', key: 'isDismissed' } as const, false)

const PANE = 'agents'
const OPEN = { id: PANE, title: 'Agents', columns: 60 }
const LIST_FRAMES = 4 // the engine's list once a second
const BAR_CELLS = 500 // wider than any row; clipped to the box
const CLOCK_COLUMNS = 7
const MARK_COLUMNS = 2
const PAD = 1

type Engine = EngineInterface

let ticker: Timer | undefined
let frames = 0

const isKnown = (list: readonly AgentRun[], id: string | undefined): id is string =>
  id !== undefined && list.some(r => r.id === id)

async function tick($: Engine) {
  const now = await $.clock.now()
  let list = await read($, runs)
  if (frames++ % LIST_FRAMES === 0) {
    const infos = await $.agent.list()
    list = await update($, runs, prev => listed(prev, infos, now))
  }
  await update($, clock, () => now)
  if (!list.some(isActive)) {
    ticker?.cancel()
    ticker = undefined
  }
}

function startTicker($: Engine) {
  ticker ??= $.clock.every(FRAME_MS, () => void tick($))
}

async function isOpen($: Engine) {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'agents-panel',
      description: 'Toggle the panel of running agents',
      immediate: true,
    })
    if ((await read($, runs)).some(isActive)) {
      startTicker($)
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      ticker?.cancel()
      ticker = undefined
      await update($, runs, () => [])
      await update($, others, () => NO_OTHERS)
    }
    return next(e)
  })

  on('command.run', { command: 'agents-panel' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      return { text: 'Agents panel closed.' }
    }
    await update($, dismissed, () => false)
    await $.ui.open(OPEN)
    return { text: 'Agents panel opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, dismissed, () => true)
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const { agentId } = result
    if (agentId === undefined) {
      return result
    }
    const now = await $.clock.now()
    await update($, runs, list =>
      spawned(
        list,
        {
          id: agentId,
          parentId: e.parentAgentId,
          type: e.subagentType,
          description: e.description,
          model: result.model,
          isTeammate: e.isTeammate,
        },
        now,
      ),
    )
    await update($, others, o =>
      o.loops.includes(agentId) ? { ...o, loops: o.loops.filter(id => id !== agentId) } : o,
    )
    await update($, clock, () => now)
    startTicker($)
    if (!(await read($, dismissed)) && !(await isOpen($))) {
      void $.ui.open(OPEN)
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (!isKnown(await read($, runs), id)) {
      return next(e)
    }
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    await update($, runs, list => toolCalled(list, id, toolLabel(tool, input)))
    startTicker($)
    const result = await next(e)
    if (result.deny === undefined && !result.isError) {
      await update($, runs, list => tracked(list, id, tool, input, result.result))
    }
    return result
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) {
      return yield* next(e)
    }
    if ((await read($, runs)).some(r => r.id === id && r.status !== 'running')) {
      await update($, runs, list => resumed(list, id))
      startTicker($)
    }
    const result = yield* next(e)
    if (isKnown(await read($, runs), id)) {
      await update($, runs, list => stepped(list, id, e.model, e.effort, result.usage))
    } else {
      await update($, others, o => counted(o, id))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (isKnown(await read($, runs), id)) {
      const now = await $.clock.now()
      await update($, runs, list => completed(list, id, e.reason, now))
      await update($, clock, () => now)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [list, other, now] = await Promise.all([read($, runs), read($, others), read($, clock)])
    const inView = e.props.view.agentId
    const width = Math.max(12, e.props.bodyColumns - 2 * PAD)
    const extra = othersLine(other)

    const header = (
      <Box flexDirection="column" alignItems="center">
        <Text>
          {title(list).map(p => (
            <Text color={p.color} bold={p.bold}>
              {p.text}
            </Text>
          ))}
        </Text>
      </Box>
    )

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={PAD}>
          {header}
          <Box marginTop={1}>
            <Text color={C.dim}>No agents yet.</Text>
          </Box>
        </Box>
      )
    }

    const rows = ordered(list)
    const live = rows.filter(([run]) => isLive(run))
    const labelColumns = Math.max(8, Math.min(20, Math.floor(width / 3)))

    const card = (run: AgentRun, depth: number) => {
      const { color } = run
      const { glyph } = mark(run)
      const cells = effortCells(run.effort)
      return (
        <Box
          key={`card:${run.id}`}
          flexDirection="column"
          borderStyle={run.id === inView ? 'bold' : 'round'}
          borderColor={color}
          paddingX={1}
          marginLeft={depth * 2}
        >
          <Box justifyContent="space-between" columnGap={1}>
            <Text wrap="truncate-end">
              {depth > 0 ? <Text color={C.dim}>↳ </Text> : null}
              <Text color={color} bold>
                {run.type.toUpperCase()}
              </Text>
              <Text color={color}>{` · ${run.description}`}</Text>
            </Text>
            <Text color={run.status === 'running' ? color : C.dim}>{`${glyph} ${stateWord(run.status)}`}</Text>
          </Box>
          <Text wrap="truncate-end">
            <Text color={C.dim}>└ </Text>
            <Text color={C.text}>{run.lastTool ?? 'starting…'}</Text>
          </Text>
          <Box flexWrap="wrap" columnGap={3}>
            {cells ? (
              <Text>
                <Text color={C.dim}>effort </Text>
                <Text color={color}>{'▮'.repeat(cells.filled)}</Text>
                <Text color={C.line}>{'▯'.repeat(cells.total - cells.filled)}</Text>
                <Text color={color} bold>{` ${run.effort}`}</Text>
              </Text>
            ) : null}
            {cardStats(run, now).map(s => (
              <Text>
                <Text color={C.dim}>{`${s.label} `}</Text>
                <Text color={C.text} bold>
                  {s.value}
                </Text>
              </Text>
            ))}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={PAD}>
        {header}
        {live.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {live.map(([run, depth], i) => (
              <Box key={`live:${run.id}`} flexDirection="column">
                {i > 0 ? (
                  <Box height={1} overflow="hidden">
                    <Text>
                      {connector(width, run.color).map(p => (
                        <Text color={p.color}>{p.text}</Text>
                      ))}
                    </Text>
                  </Box>
                ) : null}
                {card(run, depth)}
              </Box>
            ))}
          </Box>
        ) : null}
        <Box flexDirection="column" marginTop={1}>
          <Box justifyContent="space-between" columnGap={1}>
            <Text color={C.text} bold>
              {headline(list)}
            </Text>
            {extra ? <Text color={C.dim}>{extra}</Text> : null}
          </Box>
          {rows.map(([run, depth], i) => {
            const { glyph, color } = mark(run)
            return (
              <Box key={`bar:${run.id}`} height={1} columnGap={1} overflow="hidden">
                <Box key={`mark:${run.id}`} width={MARK_COLUMNS} flexShrink={0}>
                  <Text color={color}>{glyph}</Text>
                </Box>
                <Box width={labelColumns} flexShrink={0} height={1} overflow="hidden">
                  <Text color={C.text} bold={run.id === inView} wrap="truncate-end">
                    {`${i + 1}: ${depth > 0 ? '↳ ' : ''}${run.description || run.type}`}
                  </Text>
                </Box>
                <Box flexGrow={1} height={1} overflow="hidden">
                  {barParts(run, now).map(seg => (
                    <Box width={`${seg.percent}%`} flexShrink={0} height={1} overflow="hidden">
                      <Text color={seg.color}>{seg.fill.repeat(BAR_CELLS)}</Text>
                    </Box>
                  ))}
                </Box>
                <Box width={CLOCK_COLUMNS} flexShrink={0} justifyContent="flex-end">
                  <Text color={C.text}>{elapsed(run, now)}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
