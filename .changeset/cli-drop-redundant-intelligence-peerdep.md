---
'@harness-engineering/cli': patch
---

fix(cli): drop the redundant optional `@harness-engineering/intelligence`
peerDependency. It was listed as BOTH a normal `dependency` and an optional
`peerDependency` (workspace:\*), and Changesets majors any package whose
peerDependency takes a ≥minor bump — so `intelligence`'s routine 0.12→0.13
minor cascaded a phantom `cli` **major** (13.0.0) on release despite no
breaking change in cli. `intelligence` remains a normal dependency, so cli's
runtime is unchanged; this only removes the vestigial peer entry and lets cli
release as the minor it actually is (12.2.0).
