export type Git = {
  branch: string
  state: string | null
  ahead: number
  behind: number
  conflicted: number
  stashed: number
  deleted: number
  renamed: number
  modified: number
  staged: number
  untracked: number
}

export type Limits = { fiveLeft: number; fiveReset: string | null; sevenLeft: number | null; sevenReset: string | null }

export type Line = {
  model: string | null
  effort: string | null
  limits: Limits | null
  cwd: string | null
  git: Git | null
}

declare module 'claude-code' {
  interface PluginState {
    'status-line': { line: Line }
  }
}
