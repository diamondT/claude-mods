import { atom, read, update } from 'claude-code'
import type { Register, SessionUsage, SessionUsageArgs, Timer } from 'claude-code'

import { badgeColor, barRuns, formatTokens, percentOf, toSnapshot } from './snapshot'

const snapshot = atom({ plugin: 'context-band', key: 'snapshot' } as const, null)

const SUMMARY: SessionUsageArgs = { breakdown: 'summary' }
const BADGE_TEXT = '#1e1e1e'
const APPEND_THROTTLE_MS = 750

const fromUsage = ({ context }: SessionUsage) => (context.breakdown ? toSnapshot(context.breakdown) : null)

export const register: Register = on => {
  let pending: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const s = fromUsage(await $.session.usage(SUMMARY))
    if (s) {
      await update($, snapshot, () => s)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const s = fromUsage(await $.session.usage(SUMMARY))
      if (s) {
        await update($, snapshot, () => s)
      }
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const s = fromUsage(await $.session.usage(SUMMARY))
      if (s) {
        await update($, snapshot, () => s)
      }
    }
    return result
  })

  on('session.append', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && !pending) {
      pending = $.clock.after(APPEND_THROTTLE_MS, async () => {
        pending = undefined
        const s = fromUsage(await $.session.usage(SUMMARY))
        if (s) {
          await update($, snapshot, () => s)
        }
      })
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || e.props.view.agentId !== undefined || s === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const compacts = s.compactsAt === null ? '' : ` · compacts at ${formatTokens(s.compactsAt)}`

    return (
      <Box borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">◆</Text> <Text bold>context</Text>
          </Text>
          <Text>
            <Text bold>{formatTokens(s.total)}</Text>
            <Text dimColor>{` of ${formatTokens(s.max)}${compacts} `}</Text>
            <Text backgroundColor={badgeColor(s)} color={BADGE_TEXT} bold>
              {` ${s.percent}% `}
            </Text>
          </Text>
        </Box>
        {/* half blocks over two rows: a full-row bar with half-row margins */}
        {['▄', '▀'].map(fill => (
          <Text>
            {barRuns(s, e.props.bodyColumns - 4, fill).map(run => (
              <Text color={run.color}>{run.text}</Text>
            ))}
          </Text>
        ))}
        <Box flexWrap="wrap" columnGap={2}>
          {s.segments.map(seg => (
            <Text>
              <Text color={seg.color}>■</Text>
              {` ${seg.label} `}
              <Text bold>{formatTokens(seg.tokens)}</Text>
              {seg.isFree ? null : <Text dimColor>{` ${percentOf(seg.tokens, s.max)}%`}</Text>}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
