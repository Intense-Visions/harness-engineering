---
'@harness-engineering/cli': patch
---

chore(cleanup): remove dead cli/mcp exports. Un-export six intra-file-only schema constants in `interaction-schemas.ts` (`EffortLevel`, `ConfidenceLevel`, `InteractionQuestionSchema`, `QualityGateCheckSchema`, `QualityGateSchema`, `BatchDecisionSchema`) and delete the unused `__internal__` re-export block in `audit-anatomy.ts`. Pure dead-code removal; no behavior change.
