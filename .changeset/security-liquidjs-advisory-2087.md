---
'@harness-engineering/orchestrator': patch
---

security(orchestrator): resolve `liquidjs` to 10.27.2 to clear GHSA-4r6h-5v86-94p3

[GHSA-4r6h-5v86-94p3](https://github.com/advisories/GHSA-4r6h-5v86-94p3) / `CVE-2026-69222`
(high, published 2026-09-08T18:10Z) reports that LiquidJS's `join` filter charges
`memoryLimit` by element count rather than by produced string length, so a template author
can bypass `memoryLimit` and exhaust process memory. Affected: `liquidjs <= 10.27.1`;
first patched: `10.27.2`.

**Lockfile only — no manifest change.** `packages/orchestrator/package.json` already
declares `"liquidjs": "^10.26.0"`, and the patched `10.27.2` is inside that range, so this
is a three-line `pnpm-lock.yaml` resolution bump: no range edit, no `overrides` pin, and no
`auditExceptions` entry. `10.27.2` carries an identical dependency shape to `10.27.1`
(`commander: ^10.0.0`), the same `engines.node: >=16`, and the same `bin` map, so nothing
transitive moves.

**Evidence strength: `lockfile-only`, deliberately not inflated to `reached`.** The control
the advisory bypasses is not in use here: `packages/orchestrator/src/prompt/renderer.ts:7`
constructs `new Liquid({...})` with no `memoryLimit` configured, and no `join:` filter
appears in any orchestrator template. The bump is still correct — a resolved version inside
a published affected range is a concrete fact — but the practical exposure in this repo is
low, and it should not be read as a reachable sink.

Refs #2087.
