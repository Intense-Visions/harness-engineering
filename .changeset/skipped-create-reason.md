---
'@harness-engineering/cli': patch
---

`roadmap sync` no longer blames withheld creates on `--no-create` in a dry run

`--apply` is opt-in, so the default `harness roadmap sync` is a dry run and
withholds every create. It reported all of them as
`Skipped N create(s) (--no-create)` — naming a flag the caller never passed and
sending them looking for it.

The plan already recorded the real reason: `SkippedCreate.reason` is
`'create-disabled' | 'dry-run'`. The report type re-declared that shape inline
with `reason: string`, which discarded the distinction and left the renderer
nothing to switch on. The report now uses `SkippedCreate` directly and explains
each cause separately:

```
Skipped 1 create(s) (dry run; re-run with --apply to create them): Not yet linked
Skipped 1 create(s) (--no-create): Some other row
```
