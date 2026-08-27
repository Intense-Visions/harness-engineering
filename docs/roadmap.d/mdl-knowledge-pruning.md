---
slug: "mdl-knowledge-pruning"
milestone: "v2.0 Knowledge Graph & Personas"
order: 1
---

### MDL knowledge pruning — description length as the knowledge store's fitness function

- **Status:** planned
- **Spec:** —
- **Summary:** Minimum Description Length: the best model of a corpus is the one that most compresses it — a knowledge entry is only knowledge if the cost of storing and shipping it is less than the cost of the errors and re-derivations it prevents. Knowledge stores today have no fitness function, so they only grow: every session adds learnings, none are scored, and the store's marginal entry eventually costs more context than it saves. Apply MDL as the standing objective: for each entry, measure description cost (tokens shipped per inclusion x inclusion frequency) against compression value (measured reduction in re-derivation, wrong turns, and rework in runs where the entry was present vs. matched runs where it wasn't — the same matched-comparison machinery as the skill P&L). Entries that don't compress experience are pruned or merged; overlapping entries whose union compresses better than their sum are consolidated. This is the objective function the entire knowledge layer currently lacks, and it is the principled version of what curation does by hand: keep what pays rent, in its shortest sufficient form. 'Insufficient evidence' is a first-class verdict — pruning requires measured worthlessness, never measurement absence.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1630
