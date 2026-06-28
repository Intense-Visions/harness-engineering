---
slug: "diagnose-pipeline-node-path-loss-for-domain-inference"
milestone: "Planning & Process"
order: 1
---

### Diagnose pipeline node-path loss for domain inference

- **Status:** planned
- **Spec:** —
- **Summary:** Phase 6 verification of knowledge-domain-classifier showed SC#15 missed: real-repo unknown bucket went 7500 → 7553 instead of dropping to <100. Helper + wiring + config + integration test all pass; the gap is somewhere between KnowledgePipelineRunner.extract and KnowledgeStagingAggregator.generateGapReport — likely BusinessKnowledgeIngestor / DiagramParser / KnowledgeLinker creating business\_\* nodes without setting node.path. A 30-line diagnostic sampling business nodes post-extraction will localize it in minutes.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#259
