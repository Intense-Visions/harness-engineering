---
slug: "out-of-scope-records-for-rejected-ideas-checked-before-re-proposal"
milestone: "Intake"
order: 51
---

### Out-of-scope records for rejected ideas, checked before re-proposal

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. Harness keeps no durable record of rejected ideas. Rejections live in ideation-doc prose and closed issues, so they get re-proposed: the 2026-10-13 mattpocock/skills analysis rediscovered a 2026-08-10 pass on the same repo that the maintainer did not remember. mattpocock/skills keeps `.out-of-scope/<concept>.md` records (nine today), each with "Why this is out of scope" and "Prior requests" links; its `triage` skill checks them before reopening, and its SCOPE.md admits a new skill only for an observed failure that cannot be composed from existing skills. Deliverables: (1) a records directory (decide `docs/out-of-scope/` vs a knowledge-graph node type during brainstorming; it should be human-facing and committed) with a frontmatter schema (concept, decision date, rationale, prior requests, revisit-if condition) and a validator; (2) checks wired into harness-ideate, ideate-fleet, issue-fleet triage, emit_skill_proposal's soundness gate, and the external-source analysis flow (architecture-advisor comparisons), so that a matching record is surfaced, not silently blocked; (3) graph ingestion so `ask_graph` can answer "did we already reject X?"; (4) an admission rule for new skills: emit_skill_proposal must state the observed failure and why existing skills can't compose it; (5) a backfill from existing ideation "out of scope / leave" sections (e.g. docs/ideation/external-source-feature-matrix-2026-08-10.md). Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2243
