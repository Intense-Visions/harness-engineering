---
'@harness-engineering/cli': patch
---

fix(generate-slash-commands): add `--skills-dir-only` to scope generation to a single skills tree (#704)

`harness generate-slash-commands --skills-dir <path>` was only additive: it
still resolved project, community, and machine-wide global skill sources
alongside the given dir. This let globally-installed third-party skills
(`~/.harness/skills/community/…`) leak into generated artifacts.

Adds an opt-in `--skills-dir-only` flag (`GenerateOptions.skillsDirOnly`) that
makes `--skills-dir` the exclusive source, skipping all ambient resolution. The
repo's own plugin-artifact generator uses it so foreign global skills can no
longer leak into tracked plugin dirs. Default behavior (`harness setup`,
`harness generate`, MCP) is unchanged — the flag is off unless explicitly set.
