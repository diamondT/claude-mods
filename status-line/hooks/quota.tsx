import type { ClientSurface, RenderElement } from 'claude-code'

import { cells } from './line'
import type { Run } from './line'

// the pills at each detail, widest first
export type QuotaProps = { tiers: Run[][][] }

const GAP = 2

const rowCells = (pills: Run[][]) => pills.reduce((n, p) => n + cells(p), 0) + GAP * (pills.length - 1)

// the widest tier whose pills share one row; the narrowest before the first layout (0 columns)
// Partial: a reload can call it with the props of the module it replaced
export default function Quota({ tiers = [] }: Partial<QuotaProps>, surface: ClientSurface): RenderElement {
  const { Box, Text } = surface.elements
  const pills = tiers.find(t => rowCells(t) <= surface.columns) ?? tiers.at(-1) ?? []
  return (
    <Box flexWrap="wrap" columnGap={GAP}>
      {/* half blocks in the pill's colour above and below: a two-row pill with half-row margins */}
      {pills.map(item => (
        <Box flexDirection="column">
          <Text color={item[0]?.color}>{'▄'.repeat(cells(item))}</Text>
          <Text>
            {item.map(r => (
              <Text color={r.color} backgroundColor={r.bg} dimColor={r.dim} bold={r.bold}>
                {r.text}
              </Text>
            ))}
          </Text>
          <Text color={item[0]?.color}>{'▀'.repeat(cells(item))}</Text>
        </Box>
      ))}
    </Box>
  )
}
