---
'@harness-engineering/cli': minor
---

audit-component-anatomy: add Input convention with `ANAT-D004` (missing required `label` slot).

Phase 2 catalog expansion — second component after Button. `Input` joins the registry returned by `getCatalogTypes()`, so `harness-accessibility`'s step 2.6 deferral now suppresses `A11Y-050` (`<input>` without an associated `<label>`) for Input definitions whose prop type exposes no labelling affordance. The convention runner emits `ANAT-D004` (severity `error` at standard strictness, `warn` at permissive) when an Input definition is missing every one of `label` / `aria-label` / `aria-labelledby` props — the three affordances documented in `finding-codes.md` § ANAT-D004 satisfiability. Helper-text and error-text slots ship on the convention for catalog completeness but are reserved for the Tier-2 D040–D049 sub-band, not yet wired to a finding code. Adds 6 new integration tests covering each satisfier path, strictness=permissive softening, and Button+Input co-application; 2 catalog-registry unit tests assert Input's presence and Tier-1 slot shape.
