---
'@harness-engineering/cli': patch
---

fix(design): DRIFT-T001 no longer reports issue references as hardcoded colours (#1824)

A GitHub issue reference is hex-shaped — `0-9` are all valid hex digits — so `#1824`
and `#493` matched the hardcoded-colour pattern. One project measured 143 of 413
findings (35%) as this false positive on first adoption of `check-design`, which is
exactly where the rule most needs to be readable.

`detectHexBypass` now requires a colour value position before it flags, and rejects an
all-decimal match that has no colour carrier — mirroring the anchored shape that already
keeps DRIFT-T002/T003 quiet. The hex pattern is also narrowed to the CSS-valid lengths
3, 4, 6 and 8; `{3,8}` previously admitted 5 and 7, which can never be a colour.

Issue references in string prose, thrown-error messages, JSX text and CSS id selectors
are now silent. Genuine colours are still reported, including all-decimal greys such as
`background: '#666'`, gradient stops, `var()` fallbacks, palette arrays, SCSS maps and
colour-named variables, and utility-class arbitrary values such as `bg-[#1a2b3c]`.
