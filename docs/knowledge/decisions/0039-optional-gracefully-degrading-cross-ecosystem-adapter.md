---
number: 0039
title: Optional, gracefully-degrading adapter for cross-ecosystem tools
date: 2026-06-23
status: accepted
tier: medium
source: docs/changes/canary-test-integration/proposal.md
---

## Context

Harness wanted to integrate [canary](https://github.com/bop-clocktower/canary) (`canary-test-cli`) — an AI test-automation tool — into its test surface (`harness-test-advisor` Coverage Audit, `test-craft`). Two facts made a naive dependency wrong:

- **Cross-ecosystem.** canary is Python-first; its npm package is a thin Node launcher whose `postinstall` downloads a prebuilt native binary from GitHub Releases (supported platforms only: `linux-x64`, `darwin-arm64`, `win32-x64`). Under `--ignore-scripts`, offline, or on an unsupported platform, the binary is absent even though the package "installed".
- **Portability mandate.** Harness is a TypeScript/pnpm monorepo that must stay usable across Claude Code, Cursor, Codex, and Gemini CLI, and green in a Python-free CI. A hard runtime dependency on an external, platform-limited binary would compromise that.

A first instinct — make canary a required dependency, or have skills shell out to it directly — would either break portability or scatter unguarded `canary` invocations across the codebase.

## Decision

External tools from a foreign ecosystem are integrated as an **optional, gracefully-degrading adapter behind a single boundary module**, with these properties:

1. **Optional dependency.** Declared under `optionalDependencies` (precedent: `packages/graph`). A failed install never breaks `pnpm install`; CI and unrelated surfaces are unaffected.
2. **Total adapter, single boundary.** All invocation is confined to one module (e.g. `packages/intelligence/src/adapters/canary.ts`), enforced by a boundary test. Every method is _total_ — it never throws on a missing/misbehaving tool; it returns a typed `degraded` result or empty value instead.
3. **Explicit degradation taxonomy.** Absence is classified (`not-installed`, `binary-missing`, `exec-failed`, `bad-output`) so callers can branch and nudge precisely, rather than treating "not there" as an error.
4. **Structured contract, validated.** The tool is invoked for its deterministic, machine-readable output (`--json`), parsed and zod-validated at the boundary; schema drift degrades gracefully rather than corrupting downstream data.
5. **Injectable exec seam.** The process-spawning seam is injectable so the degradation logic is unit-testable without the real tool (and without fragile `node:child_process` mocking).
6. **Skills reach it via a thin MCP tool**, never by shelling out directly — preserving the boundary and the graceful-degrade contract across all clients.

When the tool is present, callers get its value; when absent, they fall back to prior behavior with an actionable install nudge. Availability is allowed to be environment-dependent; the system's _correctness_ is not.

## Consequences

- **Positive:** portability and Python-free CI preserved; one auditable boundary per tool; predictable behavior whether the tool is present or not; the pattern generalizes to any future cross-ecosystem integration.
- **Negative / tradeoffs:** "available" is environment-dependent (postinstall network + platform), so the feature is best-effort by design; the boundary adds a thin indirection layer; structured-output coupling must track the external tool's CLI across versions (pinned + zod-guarded to contain drift).
- **Scope guard:** only the deterministic, additive surface is wired in. For canary specifically, the deterministic CLI (`recommend`, `review-test`) is exposed via the adapter; generative capabilities remain on the separate plugin-dispatch path, and overlapping surfaces (e.g. static lint that duplicates harness's own linters) are deliberately left out.
