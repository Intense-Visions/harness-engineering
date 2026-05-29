---
'@harness-engineering/cli': minor
---

design-pipeline #1 (detect-design-drift + align-design-system): add finding-code catalog registries and public exports surfaces.

Both floor-raising sub-skills now ship `catalog/index.ts` registries that are the single source of truth for the v1 DRIFT-\* codes — drift declares `category` + `standardSeverity` per code, align declares `handling` (`codemod-or-suggestion` vs `suggestion-only`) per code. The inline `STANDARD_SEVERITY` table previously embedded in `drift/findings/finding.ts` now reads from the catalog so the public catalog and `severityFor()` cannot drift apart. New `drift/exports.ts` and `align/exports.ts` modules become the stable contract for sibling skills + the (future) #5 design-pipeline orchestrator — mirroring `audit/component-anatomy/exports.ts` so the orchestrator can pattern-match across all floor-raising sub-projects. Adds 17 unit tests covering catalog shape, public re-export parity, severityFor↔catalog consistency, and the drift↔align v1-parity invariant. No runtime behavior change.
