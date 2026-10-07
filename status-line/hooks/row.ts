import type { RenderElement, RenderNode } from 'claude-code'

// context-band and status-line share one row of panels under the engine's hint line,
// status-line first. The row grows to the hint row's width rather than the viewport's,
// which is the transcript column's while a pane is docked. The engine's own drawing
// stays outside the panels Box, so the engine keeps drawing that line; both mods carry
// this file.
const ROW = 'prompt-row'
const PANELS = 'prompt-row:panels'

type BoxElement = Extract<RenderElement, { type: 'Box' }>

const isBox = (n: RenderNode, key: string): n is BoxElement =>
  typeof n !== 'string' && n.type === 'Box' && n.props?.key === key

export function addPanel(below: RenderElement, panel: RenderElement, first = false): RenderElement {
  if (!isBox(below, ROW)) {
    return {
      type: 'Box',
      props: { key: ROW, flexDirection: 'column', flexGrow: 1 },
      children: [{ type: 'Box', props: { key: PANELS, columnGap: 1 }, children: [panel] }, below],
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
