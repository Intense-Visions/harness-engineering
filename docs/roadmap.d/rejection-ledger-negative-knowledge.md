---
slug: "rejection-ledger-negative-knowledge"
milestone: "Intake"
order: 49
---

### Rejection ledger — durable negative knowledge that stops re-proposal

- **Status:** planned
- **Spec:** —
- **Summary:** Decision records capture what was chosen; nothing captures what was refuted and why, so generators re-propose dead ideas at exactly the rate they generate. At high generation rates the dominant ideation waste is re-derivation of already-refuted approaches — each round of ideation, brainstorming, or inbound triage re-litigates proposals that died months ago, and the refutation is buried in a closed PR thread nobody will find. Build the rejection ledger: a first-class store of refuted approaches, each entry carrying the approach's semantic fingerprint, the refutation (the specific reason it fails), the premises the refutation depends on, and provenance. Ideation and intake query it by semantic match before proposing; a hit surfaces the prior refutation instead of re-exploring. Critically, refutations expire: each entry's premises are linked to detectable conditions (a dependency version, a constraint, a scale threshold), and when a premise no longer holds the entry is flagged for re-evaluation rather than silently blocking a now-viable idea — negative knowledge decays like any other and must be tended, not hoarded. **Wave 1 of ADR-0133 folds in the concrete record form and the check sites**, from the mattpocock/skills comparison (docs/architecture/mattpocock-skills-comparison/analysis.md §6), which found the same gap independently: (a) committed, human-facing records — decide in brainstorming between `docs/out-of-scope/<concept>.md` with a frontmatter schema (concept, decision date, rationale, prior requests, revisit-if condition) plus a validator, a graph-native node type, or both (file canonical, graph ingested); (b) checks wired into harness-ideate, ideate-fleet, issue-fleet triage, `emit_skill_proposal`'s soundness gate, and the external-source analysis flow (architecture-advisor comparisons), each **surfacing** a matching refutation rather than silently blocking; (c) graph ingestion so `ask_graph` can answer "did we already reject X?"; (d) a backfill from existing ideation "out of scope / leave" sections (e.g. docs/ideation/external-source-feature-matrix-2026-08-10.md). The 2026-10-13 mattpocock/skills pass is itself the motivating incident: it rediscovered a 2026-08-10 pass on the same repo that the maintainer did not remember. The companion skill-admission bar (observed failure plus non-composability for new skills) is a separate item, #2243, and is not in scope here.
- **Blockers:** Depends on `semantic-duplicate-detection-at-backlog-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1620
