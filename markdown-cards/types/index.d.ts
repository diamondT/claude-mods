// ids of the doc cards drawn raw
export type RawIds = string[]

declare module 'claude-code' {
  interface PluginState {
    'markdown-cards': { raw: Shaped<RawIds> }
  }
}
