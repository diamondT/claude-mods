export type Segment =
  | { kind: 'md'; text: string }
  | { kind: 'doc'; id: string; body: string }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const DOC_LANGS = new Set(['markdown', 'md'])

type Fence = { char: string; size: number; info: string }

const fence = (line: string): Fence | null => {
  const match = FENCE.exec(line)
  if (!match) {
    return null
  }
  const [, run = '', info = ''] = match

  return { char: run.charAt(0), size: run.length, info: info.toLowerCase() }
}

// FNV-1a, so a card keeps its id across redraws and reloads
export const hash = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return (h >>> 0).toString(36)
}

const closingBare = (lines: string[], start: number, open: Fence): number => {
  for (let i = start; i < lines.length; i++) {
    const f = fence(lines[i] ?? '')
    if (f && !f.info && f.char === open.char && f.size >= open.size) {
      return i
    }
  }

  return -1
}

// The closing line of a doc opened by `open`, from `start`; -1 while unclosed.
// By the spec a fence as long as the opener closes it, but replies nest them
// anyway: one with an info string opens an inner block, a bare one closes it.
const closing = (lines: string[], start: number, open: Fence): number => {
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    const f = fence(lines[i] ?? '')
    if (!f || f.char !== open.char || f.size < open.size) {
      continue
    }
    if (f.info) {
      depth++
    } else if (depth > 0) {
      depth--
    } else {
      return i
    }
  }

  return -1
}

export const split = (text: string): Segment[] => {
  const lines = text.split('\n')
  const out: Segment[] = []
  let md: string[] = []
  const flush = () => {
    if (md.length > 0) {
      out.push({ kind: 'md', text: md.join('\n') })
      md = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const open = fence(line)
    if (!open) {
      md.push(line)
      continue
    }
    if (!DOC_LANGS.has(open.info)) {
      // another language's block: carry it whole so its contents aren't read as fences
      const end = closingBare(lines, i + 1, open)
      const last = end === -1 ? lines.length - 1 : end
      md.push(...lines.slice(i, last + 1))
      i = last
      continue
    }
    const end = closing(lines, i + 1, open)
    if (end === -1) {
      md.push(...lines.slice(i))
      break
    }
    flush()
    const body = lines.slice(i + 1, end).join('\n')
    out.push({ kind: 'doc', id: hash(body), body })
    i = end
  }
  flush()

  return out
}
