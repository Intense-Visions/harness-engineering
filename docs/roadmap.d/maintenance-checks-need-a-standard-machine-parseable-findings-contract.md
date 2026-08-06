---
slug: "maintenance-checks-need-a-standard-machine-parseable-findings-contract"
milestone: "Maintenance: Lint & Deps"
order: 9
---

### Maintenance checks need a standard machine-parseable findings contract

- **Status:** done
- **Spec:** docs/changes/maintenance-findings-contract/proposal.md
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** `harness maintenance run` derives each task's findings count by regex-recovering it from free-text check output (`N findings|issues|violations|errors`, plus a keyword fallback in `classifyCheckExecutionFailure`). This is fragile: `doc-drift` (`check-docs`) and `entropy` (`cleanup`) emit no clean count and rely on recovery; if any check changes its output wording the count can silently break (the same class of bug that originally made the report show a uniform '1 finding'). **Proposal:** give maintenance check subcommands a standard machine-readable findings contract (e.g. a `--json` mode emitting `{ findings: N, ... }`) and have the runner consume that instead of regex-recovering from prose. Cross-cutting across ~18 check commands — deserves its own spec. **Scope note:** deliberately deferred from #687 to avoid scope creep; the regex recovery is the documented stopgap.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#691
