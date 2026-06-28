---
'@harness-engineering/cli': patch
---

Implement the audit-anatomy ANAT-P\* pattern engine, which was a no-op (`void mode`) — `full` mode behaved identically to `fast` and `patternsApplied` was always empty. A new, extensible pattern catalog (`catalog/patterns/`) ships the two flagship composition patterns:

- **ANAT-P001 map-without-empty** — a list rendered with `.map(...)` but no empty-state branch (length-zero guard, `EmptyState`, "no results" copy).
- **ANAT-P002 fetch-without-loading** — async data loading (`fetch` / query hook / awaited effect) with no loading affordance (skeleton, spinner, Suspense, `isLoading`).

`full` mode now runs these over every audited file (composition patterns aren't bound to a resolved component type), emits `warn`-severity findings with manual fix hints, and reports the applied pattern ids in `summary.catalog.patternsApplied`; `fast` mode is unchanged (conventions only). Detection uses conservative source heuristics (a finding fires only when the triggering construct is present and no mitigating affordance appears in the file) — no tree-sitter dependency. The `PatternCheck` interface is the extension point for the rest of the catalog (P003+).
