---
slug: "spill-to-disk-with-a-followup-readable-locator-for-large-tool-output"
milestone: "Intake"
order: 48
---

### Spill-to-disk with a followup-readable locator for large tool output

- **Status:** done
- **Spec:** —
- **Summary:** dsh's spill mechanism writes large tool output past a size threshold to disk and returns a locator the model can read/search later instead of truncating inline. Fleet and autopilot sessions that accumulate large test logs, full diffs, or grep/glob overflow today truncate ad hoc with no recovery path. Add an equivalent spill backend to harness's own long-running session/state handling (packages/core session state, or a new small package) so fleet workers and autopilot can offload large intermediate output and reference it by locator instead of losing it or blowing the context budget.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1398
