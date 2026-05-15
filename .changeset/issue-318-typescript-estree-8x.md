---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

fix(deps): bump `@typescript-eslint/typescript-estree` to `^8.29.0` (closes #318)

The bundled `@typescript-eslint/typescript-estree@7.18.0` capped supported
TypeScript at `<5.6.0`, so every CLI invocation that parsed TS on a modern
TypeScript (5.6+ / 6.x) emitted a noisy "you are running a version of
TypeScript which is not officially supported" warning to stderr. The warning
cluttered CI logs and hook output and falsely implied a project misconfig.

Bumps both `@harness-engineering/cli` and `@harness-engineering/core` to
`^8.29.0`. The 8.x line supports TS 5.6+ and has experimental support for
newer versions; parser behavior for valid TS is unchanged.
