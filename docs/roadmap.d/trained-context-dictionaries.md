---
slug: "trained-context-dictionaries"
milestone: "Parallel Execution & State"
order: 137
---

### Trained context dictionaries — a verified codebook for recurring knowledge

- **Status:** planned
- **Spec:** —
- **Summary:** Zstd's largest wins on small documents come from pre-trained dictionaries: learn the corpus's recurring substrings once, then encode every new document against the dictionary. The context analog: a large fraction of every prompt is recurring knowledge — conventions, schemas, standard instructions, architectural facts — re-sent verbatim thousands of times. Train a dictionary over the corpus of past assembled contexts: bind stable, high-frequency knowledge to short handles in a controlled vocabulary, send the handle, and expand on demand only when the consumer actually needs the full text. Linguistics arrives at the same design independently — every co-located team develops jargon precisely because it compresses communication — with the known failure mode that jargon drifts. So the codebook is governed: every term is bound to a verified definition with a version, expansion is deterministic, and a term whose definition changes bumps its version so no consumer silently holds a stale meaning. Measurement decides membership: a term enters the dictionary when its (frequency x length) crosses the amortization threshold and leaves when usage decays — the dictionary is trained and re-trained, not curated by hand.
- **Blockers:** Depends on `stability-ordered-context-layout`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1635
