---
slug: "rename-quality-gate-hook-and-ship-a-strict-variant-that-blocks"
milestone: "v5.0 — Enforcement Hardening"
order: 0
---

### Rename quality-gate hook and ship a strict variant that blocks

- **Status:** done
- **Spec:** docs/changes/quality-warner-strict-gate/proposal.md
- **Summary:** `packages/cli/src/hooks/quality-gate.js:4-6` is literally documented as "Never blocks (always exits 0). Warnings go to stderr." This hook ships in the default **standard** profile. The hook NAMED "quality-gate" gates nothing. Rename to `quality-warner` or `format-checker`. Add a `strict-quality-gate` hook variant for strict-profile adopters that exits 2 on lint/format failure. Source: Pass 5 #1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#526
- **Updated-At:** 2026-06-25T23:56:30.691Z
