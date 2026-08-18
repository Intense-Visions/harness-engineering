---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

fix(adr): add duplicate-`number:` validator for the ADR corpus and grandfather the existing collisions (#1323)

`harness validate` now scans `docs/knowledge/decisions/*.md` for duplicate
`number:` frontmatter values — an ambiguous ADR identity silently breaks
citations and any tooling keyed on the number (the DecisionIngestor, spec
cross-references). New or changed collisions fail validation; the 10 known
pre-existing collisions are grandfathered via
`.harness/decisions/number-baseline.json` and surfaced as a single non-fatal
warning, so the check adopts without forcing a mass renumber. The corpus is
left as-is because bare "ADR NNNN" citations across the repo are ambiguous
between the colliding records; the renumber is tracked as a follow-up.
