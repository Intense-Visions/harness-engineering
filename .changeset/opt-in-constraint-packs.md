---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add opt-in constraint packs — named bundles of blocking rules a project chooses
to enforce per lifecycle stage rather than all-or-nothing.

A project opts in via `constraintPacks: [...]` in `harness.config.json`. Each
pack maps onto the existing security rule sets and elevates a set of rules to
blocking at the stage(s) it declares (`pre-commit`, `pre-merge`, `pre-release`).
Three built-in packs ship: `secrets-and-injection` (secrets + injection, at
pre-merge and pre-release), `ai-agent-safety` (unsafe AI-agent/MCP config, at
pre-merge), and `web-hardening` (XSS, path traversal, unsafe network, weak
crypto, at pre-release).

Packs are a thin overlay on the existing check machinery, not a new enforcement
engine: `runCIChecks` resolves the opted-in packs and merges their rule
elevations into the security check's config before it runs, so opting in
genuinely turns the rules on. A project's own explicit `security.rules` entry
always wins over a pack overlay (a per-rule escape hatch). `harness ci check`
gains a `--stage <stage>` flag to enforce only the packs that apply at that
stage, and the check report carries a per-pack, per-stage compliance summary
(`compliant` / `non-compliant` / `n/a`). Empty or absent `constraintPacks`
leaves all existing behavior unchanged.
