---
slug: "scope-harness-validate-to-changed-surface"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 91
---

### Scope `harness validate` to the changed surface — 68% of all invocations

- **Status:** done
- **Spec:** —
- **Summary:** Adoption telemetry from a dogfood consumer (`.harness/metrics/adoption.jsonl`, 3,090 records) shows `cli/validate` accounts for **2,097 invocations — 68% of every harness CLI call**, with `cli/check-deps` second at 441 (14%). Two commands are 82% of all usage; nothing else exceeds 65 calls. No `--changed`, `--since`, `--scope`, `--affected` or `--incremental` flag exists in `package.json` or `harness.config.json`, so the hot path appears to re-validate the full surface every time — while the same repo's `.turbo/cache` holds 12,234 entries at 1.6 GB, meaning the underlying task work is already memoised and `validate` is likely not riding it. Build: an affected-only mode that derives the changed surface from git and delegates to the existing cache, with the full sweep reserved for pre-merge and scheduled runs. This is the single highest-leverage latency and cost fix available, because it multiplies against the most-called command in the tool.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1523
