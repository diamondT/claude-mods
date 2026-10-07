export type Segment = { label: string; tokens: number; color: string; isFree: boolean }

export type Snapshot = {
  total: number
  max: number
  percent: number
  compactsAt: number | null
  segments: Segment[]
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': { snapshot: Snapshot | null }
  }
}
