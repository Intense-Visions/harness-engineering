---
'@harness-engineering/core': patch
---

fix(drift): exclude forward-looking docs/changes from structure drift (#1326)

`checkStructureDrift` now consults the same `forwardLookingPaths` exclusion that
`checkApiSignatureDrift` already honored, so broken-link/broken-anchor structure
findings inside forward-looking historical docs (`docs/changes/**`, ADRs,
proposals) are suppressed. `docs/changes/**` is the immutable historical record
of shipped changes; its dangling links are unactionable by design — "fixing"
them edits history — and were the dominant contributor (~223 findings) to
documentation-drift counts. A dangling link in a non-forward-looking doc (e.g.
`docs/reference/**`) is still flagged.
