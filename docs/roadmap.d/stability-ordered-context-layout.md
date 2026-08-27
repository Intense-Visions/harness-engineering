---
slug: "stability-ordered-context-layout"
milestone: "Parallel Execution & State"
order: 135
---

### Stability-ordered context layout — cache-aware delta encoding for every request

- **Status:** planned
- **Spec:** —
- **Summary:** Prompt caching is delta encoding against a shared prefix, but nothing in the field designs for it — context is assembled in whatever order the assembler finds convenient, so one volatile line early in the prompt invalidates the cache for everything after it. Borrow the storage-engine discipline that made column stores win: layout determined by change pattern, not by logical grouping. Arrange every assembled context in strictly descending stability order — immutable knowledge and tool schemas first, slow-moving conventions next, session state after, per-turn state last — so the cacheable prefix is maximal by construction, and represent recurring artifacts as content-addressed baselines plus deltas rather than re-serialized wholes. The win compounds on every request forever, costs nothing at runtime, and is measurable to the token: cache-hit fraction per workflow class before and after. This is the rare optimization that is nearly free, provably correct (layout does not change content), and applies to every context the system ever assembles — the highest ROI-per-effort item in the compression family, and the substrate the rest of the family builds on.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1634
