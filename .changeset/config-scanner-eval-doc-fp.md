---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): config scanner no longer fail-closes dispatch on a doc mention of eval()

The pre-dispatch workspace config scanner scans `CLAUDE.md` / `AGENTS.md` and kept
`SEC-INJ-001` (eval / Function constructor) at blocking severity. Agent-guidance docs
routinely NAME `eval()` as an example of what NOT to do, and a markdown file cannot
execute it — so a single documentation mention fail-closed EVERY dispatch
("Config scan blocked dispatch: SEC-INJ-001"). `SEC-INJ-001` now joins `SEC-AGT-006`
in the config-scanner's documentation-downgrade set (taint, not block), mirroring the
existing treatment of security-measure documentation. Genuine injection categories
(hidden-unicode `INJ-UNI-*`, re-role `INJ-REROL-*`) still block.
