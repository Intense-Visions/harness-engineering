---
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': patch
---

feat(validate): scope `harness validate` to the changed surface (`--changed`/`--affected`/`--since`)

Adds an opt-in affected-only mode to `harness validate`. The design audits
(detect-drift, audit-brand) walk the whole source tree on every run, which is the
dominant cost of the most-invoked CLI command (adoption telemetry: `cli/validate` =
68% of all harness CLI calls). `--changed` (alias `--affected`) derives the changed
surface from git — the merge-base with the default branch, or an explicit
`--since <ref>` — and hands just those files to the walkers. The surface is narrowed
to the source extensions and exclude globs a full sweep would scan, so a scoped run is
always a subset of a full run (it never reports a finding a full sweep would not). If
the surface cannot be derived, the run falls back to a full sweep and reports why.
Bare `harness validate` is unchanged (full sweep) — non-breaking for adopters and
pre-merge/scheduled/release gates. Every affected run prints what it scoped and the
staleness caveat, and the scoped-vs-full split is recorded on the `cli/validate`
adoption record (`variant` field). The orchestrator package's `validate` dev-loop
script is rewired to `--changed`.

The same affected-mode is exposed to skills/agents through the MCP `validate_project`
tool via an opt-in `scope: "affected" | "full"` / `changed` / `since` param — it
delegates to the same `runValidate` (validate-scope is shared, not forked), and the
default path stays byte-identical.
