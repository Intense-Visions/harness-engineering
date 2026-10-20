---
'@harness-engineering/cli': patch
---

test: pin the five `-c`-implied-project-root fixes #2285 left undetectable.

#2285 fixed nineteen commands that read their config from `-c/--config` but
measured — or wrote to — `process.cwd()`. Twelve were pinned by a behavioural
test; `fix-drift`, `cleanup`, `release-inventory`, `check-design` and
`check-operational-drift` were not, so reverting any of them left the whole
`packages/cli` suite green. Each now has a case in
`tests/commands/config-implied-root.test.ts` that asserts a named artifact or a
non-zero denominator only the tmpdir fixture can produce, and that fails when
the pre-#2285 behaviour is restored. `fix-drift` asserts where the write landed.
Behaviour-only; no runtime change.
