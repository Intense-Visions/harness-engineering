---
'@harness-engineering/core': patch
---

fix(core): count test-file imports in the dead-export detector

The dead-export detector was test-import-blind: test files (`*.test.ts`,
`*.spec.ts`) are excluded from the classification snapshot, so an export
imported only by its test had zero importers and was wrongly flagged dead. A
single run reported 266 false positives (220 in `packages/cli/src/commands`,
e.g. `runVerify` imported by `verify.test.ts`), and `cleanup --fix` would have
deleted live code.

`buildSnapshot` now harvests test-file import edges into a new additive
`snapshot.testImports` field (path + imports only — test files are still never
classified as dead), and the detector treats an export imported by any test as
live. Genuine dead exports are unaffected.
