---
slug: "outcrossing-against-mullers-ratchet"
milestone: "Parallel Execution & State"
order: 134
---

### Outcrossing against Muller's ratchet — periodic independent re-derivation in long chains

- **Status:** planned
- **Spec:** —
- **Summary:** Population genetics: an asexual lineage accumulates deleterious mutations irreversibly (Muller's ratchet) because without recombination there is no mechanism to reassemble a less-loaded genome; sex persists largely because outcrossing purges load. An agent iterating on its own output for forty turns is an asexual lineage — every misconception it forms is inherited by every subsequent turn, and self-review cannot purge what the self believes. The n-version work already on the roadmap votes between independent versions at the end; this is different machinery for a different moment: purge error *during* the run. At fixed intervals in any long self-iterating chain, inject an outcross — an independent re-derivation of the current subproblem from the spec, in a fresh context that has never seen the working copy — and reconcile by recombination at module boundaries (take the outcross's version of components where it diverges and its version passes stricter checks), not winner-take-all. The interval is tunable by measured drift: chains whose self-consistency metrics degrade faster outcross more often. The cost is one extra derivation per interval; the benefit, if the biology transfers, is that error load stops being monotonic in chain length — which is currently the binding constraint on how long a chain can safely run unattended.
- **Blockers:** Depends on `redundancy-dial-n-version-generation`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1619
