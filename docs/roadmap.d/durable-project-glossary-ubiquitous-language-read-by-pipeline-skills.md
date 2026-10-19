---
slug: "durable-project-glossary-ubiquitous-language-read-by-pipeline-skills"
milestone: "Intake"
order: 57
---

### Durable project glossary (ubiquitous language) read by pipeline skills

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 2 of ADR-0133. Harness has no durable, project-level ubiquitous language. The session `terminology` section (declared in `SESSION_SECTION_NAMES`, packages/types/src/session-state.ts:16; read and written by packages/core/src/state/session-sections.ts) is session-scoped and gets archived, graph business_fact nodes cover strategy/business knowledge rather than domain terms, and "glossary" appears only in four tier-3 domain skills (design-consistency, design-naming-conventions, harness-i18n-workflow, ux-settings-preferences). mattpocock calls a maintained GLOSSARY.md "might be the single coolest technique in this repo" [UNVERIFIED]: it cuts agent verbosity and misnaming because every skill reads the same terms. A domain-modeling skill actively sharpens it during grilling, and other skills read it passively via a one-line pointer. Deliverables: (1) decide in brainstorming between a committed GLOSSARY.md (term, definition, aliases-to-avoid, related ADRs) with a schema validator, a graph-native `glossary_term` node type, or both (file canonical, graph ingested), consistent with the ADR-0036 rule that strategy is interview-only (a glossary is not strategy, but auto-generating it from code risks the same failure); (2) passive read pointers in brainstorming, planning, product-requirements, and the comprehension substrate; (3) active maintenance: brainstorming and knowledge-craft propose term additions/renames for human confirmation, and naming-craft flags identifiers that contradict glossary terms; (4) promotion of recurring session `terminology` entries into the glossary at session archive. Serves the Upstream grounding track. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2247
