---
'@harness-engineering/core': patch
---

fix(entropy): drift no longer flags working links (slug + nested-fence)

`checkStructureDrift` no longer reports working documentation links as drift.
`slugifyHeading` now matches GitHub's GFM slugger: it keeps the leading hyphen
an emoji leaves behind (`## 📖 Usage` → `#-usage`) and preserves Unicode letters
(`## Café` → `#café`) instead of dropping them as ASCII `\w` did. A new
nesting-aware fence stripper closes a fence only on a same-character run at least
as long as the opener, so a 4-tick fence wrapping a 3-tick block no longer
exposes the inner half; it is shared by both link and heading extraction, so a
`# Title` quoted inside a fence is no longer treated as a real anchor. Duplicate
headings now disambiguate GitHub-style (a second `## Setup` anchors at
`#setup-1`). Preserves the earlier fence-awareness and `&`-heading fixes.
