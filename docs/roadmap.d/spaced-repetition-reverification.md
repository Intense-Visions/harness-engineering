---
slug: "spaced-repetition-reverification"
milestone: "v2.0 Knowledge Graph & Personas"
order: 2
---

### Spaced repetition — expanding-interval re-verification for standing knowledge

- **Status:** planned
- **Spec:** —
- **Summary:** Learning science's most robust result is the spacing effect, and its scheduling algorithms (Leitner boxes through SM-2) share one shape: re-test at expanding intervals while an item keeps passing, contract sharply on failure — maximum assurance per test administered. Standing knowledge here — compiled facts, calibration baselines, safety-case evidence, precedents, canonical assumptions — is re-verified on either fixed cadences (wasteful for stable items, too slow for volatile ones) or never. Import the scheduler: every re-verifiable item carries a verification interval that expands on each pass (stable knowledge earns infrequent checks) and collapses on failure or on premise-change signals (an item that failed re-verification, or whose linked premises shifted, returns to the short-interval box), with per-class interval policies and a global re-verification budget the scheduler optimizes within. This is the missing scheduling discipline behind several shipped items — metrology recalibration cadences, safety-case evidence currency, rejection-ledger premise checks, knowledge-store staleness — replacing their per-item fixed cadences with one budget-aware scheduler that spends verification where instability has been demonstrated. The measurable claim: at equal verification spend, spaced scheduling holds a lower stale-knowledge rate than fixed cadence.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1680
