# claude-mods

Claude Code mods (function-hook plugins).

| Mod | What it does |
| --- | --- |
| [`context-band`](./context-band) | Live context window breakdown (per category bar + legend) in a band above the prompt. |
| [`status-line`](./status-line) | Replaces the prompt hint row with permission mode, model + effort, 5h/7d quota, cwd and git status. |

## Install

At the prompt of a terminal session:

```
/plugin install context-band --marketplace diamondT/claude-mods
/plugin install status-line --marketplace diamondT/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; Enter).

## Requirements

- `status-line`: `git` and `date` (GNU or BSD) on `PATH`.

## Develop

Run from a working copy:

```
claude --plugin-dir ./context-band --plugin-dir ./status-line
```

or in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-band:/path/to/claude-mods/status-line" } }
```

Check:

```
claude plugin validate .
claude plugin test context-band
claude plugin test status-line
```

`tsc -p <mod>` type-checks a mod once it has loaded (the engine writes `<mod>/.claude-plugin/types/`).
