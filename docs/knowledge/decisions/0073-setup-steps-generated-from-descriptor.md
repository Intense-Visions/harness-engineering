---
number: 0073
title: Setup-step docs are generated from a shared client descriptor
date: 2026-07-16
status: accepted
tier: integration
source: docs/changes/agent-setup-prompt/proposal.md
---

## Context

Two consumers describe how a client installs harness: `harness setup`
(`packages/cli/src/commands/setup.ts`, which detects clients and wires MCP)
and human-facing install prose (`README.md`, and now the agent-setup
`prompt.md`). Historically the `setup.ts` client array carried
`name`/`dir`/`client`/`configTarget` but **no** plugin names — those lived
only in `README.md`, so the two representations could drift. The agent-setup
prompt (`docs/agent-setup/prompt.md`) is a fetchable, agent-executable
installer; if it misdescribes what `harness setup` does, an agent installs the
wrong thing. This is decision **D4** of the agent-setup-prompt proposal.

## Decision

Setup-step documentation is **generated from code**, not hand-maintained in
prose. A single enriched descriptor, `SETUP_CLIENTS` in
`packages/cli/src/setup/clients.ts`, is the sole source of truth for
per-client install + MCP-setup steps. `harness setup` consumes it (via the
subset of fields it needs), and the generator
`scripts/generate-agent-setup-prompt.mjs` reads it (via a `tsx` JSON emitter,
`print-clients.ts`) to produce `docs/agent-setup/prompt.md`. The emitter also
exports `REQUIRED_NODE_VERSION` so the prompt's Prerequisites section cannot
drift from the CLI's minimum. The generated file is drift-gated by the
existing `generate-docs --check` mechanism, and a vitest parity test asserts
`SETUP_CLIENTS` matches the clients `setup.ts` detects.

**Consequence for contributors:** to add or change a supported client, edit
`SETUP_CLIENTS` — never hand-edit `prompt.md` or duplicate install steps in
prose. The freshness gate blocks any push whose `prompt.md` was not
regenerated after a descriptor change.

## Consequences

**Positive:** one source of truth; the prompt cannot misdescribe `harness
setup`; new clients are a one-place edit enforced by the parity test + drift
gate.

**Negative:** the generator depends on `tsx` to read a `.ts` module from an
`.mjs` script (mirrors `scripts/generate-plugin.mjs`); `prompt.md` is a
generated artifact and must not be hand-edited.

**Neutral:** an alternative (a co-located `clients.json` re-exported by
`clients.ts`) was rejected because it reintroduces a second file that must
stay in sync — the exact drift this decision removes.

## Related

- Spec: `docs/changes/agent-setup-prompt/proposal.md` (decisions D1–D6, esp. D4)
- Generator convention: `scripts/generate-plugin.mjs` (tsx invocation)
- Drift gate: `scripts/generate-docs.mjs`, `.husky/pre-push`, `.github/workflows/ci.yml`
