# AGENTS.md

## Versioning

The mods ship through the `claude-mods` marketplace. Claude Code updates an installed plugin only when its version string changes; without a bump, users keep the cached copy.

- Every change to a mod (fix, feature, cosmetic) bumps `version` in `<mod>/.claude-plugin/plugin.json`, in the same commit. Bump only the mods you touched.
- Scheme `0.YYYYMMDD.N`: today's date, `N` = 1 for the mod's first release that day, else previous `N` + 1. E.g. `0.20261012.1`, `0.20261012.2`, `0.20261013.1`.
- Bump the major only for a breaking change (`1.20270105.1`).
- Don't put `version` in `.claude-plugin/marketplace.json` entries; `plugin.json` overrides them.

## Release

Before pushing:

```
claude plugin validate .
```

To pick up a pushed release:

```
claude plugin marketplace update claude-mods
claude plugin update <mod>@claude-mods
```

then `/reload-plugins` in open sessions.
