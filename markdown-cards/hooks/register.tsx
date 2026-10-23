import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { split } from './fences'

const KEEP = 200

// Change the tag when the stored ids change meaning.
const raw = atom({ plugin: 'markdown-cards', key: 'raw' } as const, [], { shape: 'raw-1' })

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) {
      return next(e)
    }
    const segments = split(e.props.text)
    if (!segments.some(s => s.kind === 'doc')) {
      return next(e)
    }

    const { Box, Button, Code, Markdown, Text } = $.ui.resolve(e)
    const rawIds = await read($, raw)
    const toggle = (id: string) => () =>
      void update($, raw, ids =>
        ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id].slice(-KEEP),
      )

    return (
      <Box flexDirection="column">
        {segments.map(s => {
          if (s.kind === 'md') {
            return s.text.trim() === '' ? null : <Markdown text={s.text} />
          }
          const isRaw = rawIds.includes(s.id)

          return (
            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>markdown</Text>
                <Button key={`toggle-${s.id}`} plain dimColor onPress={toggle(s.id)}>
                  {isRaw ? 'rendered' : 'raw'}
                </Button>
              </Box>
              {isRaw ? <Code source={s.body} language="markdown" /> : <Markdown text={s.body} />}
            </Box>
          )
        })}
      </Box>
    )
  })
}
