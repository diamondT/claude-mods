# claude-mods

Claude Code mods (function-hook plugins).

| Mod | What it does |
| --- | --- |
| [`context-band`](./context-band) | Live context window breakdown (per category bar + legend) in a panel under Claude Code's hint line. |
| [`status-line`](./status-line) | Model + effort, 5h/7d quota, cwd and git status in a panel under Claude Code's hint line. |
| [`agents-panel`](./agents-panel) | Running subagents, their latest tool call, tokens and progress bars in a side panel. Opens on the first spawn (fullscreen, 144+ columns); `/agents-panel` toggles it. |

Installed together, the two panels share one row, half width each.

## Install

At the prompt of a terminal session:

```
/plugin install context-band --marketplace diamondT/claude-mods
/plugin install status-line --marketplace diamondT/claude-mods
/plugin install agents-panel --marketplace diamondT/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; Enter).

## Requirements

- `status-line`: `git` and `date` (GNU or BSD) on `PATH`; a [Nerd Font](https://www.nerdfonts.com) in the terminal (quota pills).

## Develop

Run from a working copy:

```
claude --plugin-dir ./context-band --plugin-dir ./status-line --plugin-dir ./agents-panel
```

or in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-band:/path/to/claude-mods/status-line:/path/to/claude-mods/agents-panel" } }
```

Check:

```
claude plugin validate .
claude plugin test context-band
claude plugin test status-line
claude plugin test agents-panel
```

`tsc -p <mod>` type-checks a mod once it has loaded (the engine writes `<mod>/.claude-plugin/types/`).
