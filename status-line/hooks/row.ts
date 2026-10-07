import type { RenderElement, RenderNode } from 'claude-code'

// context-band and status-line share one row of panels under the engine's hint line,
// status-line first. The engine's own drawing stays outside any sized Box, so the
// engine keeps drawing that line; both mods carry this file.
const ROW = 'prompt-row'
const PANELS = 'prompt-row:panels'
const DEFAULT_COLUMNS = 80
// the engine pads the hint row 2 each side
const ROW_INSET = 4

type BoxElement = Extract<RenderElement, { type: 'Box' }>

const isBox = (n: RenderNode, key: string): n is BoxElement =>
  typeof n !== 'string' && n.type === 'Box' && n.props?.key === key

export function addPanel(
  below: RenderElement,
  panel: RenderElement,
  columns = DEFAULT_COLUMNS,
  first = false,
): RenderElement {
  if (!isBox(below, ROW)) {
    return {
      type: 'Box',
      props: { key: ROW, flexDirection: 'column' },
      children: [{ type: 'Box', props: { key: PANELS, width: columns - ROW_INSET, columnGap: 1 }, children: [panel] }, below],
    }
  }
  return {
    ...below,
    children: below.children?.map(c => {
      if (!isBox(c, PANELS)) {
        return c
      }
      const panels = c.children ?? []
      return { ...c, children: first ? [panel, ...panels] : [...panels, panel] }
    }),
  }
}
