export type RunStatus = 'running' | 'waiting' | 'idle' | 'done' | 'failed' | 'stopped'

export type AgentRun = {
  id: string
  parentId: string | null
  type: string
  description: string
  model: string | null
  effort: string | null
  isTeammate: boolean
  status: RunStatus
  startedAt: number
  endedAt: number | null
  toolUses: number
  lastTool: string | null
  requests: number
  // the last request's input, cache included; output summed over requests
  contextTokens: number
  outputTokens: number
}

// model loops no agent.spawn announced (the engine's forks)
export type Others = { loops: string[]; requests: number }

declare module 'claude-code' {
  interface PluginState {
    'agents-panel': { runs: Shaped<AgentRun[]>; others: Others; now: number; isDismissed: boolean }
  }
}
