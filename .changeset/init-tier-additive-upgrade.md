---
'@harness-engineering/cli': patch
---

`harness init --tier <higher>` on an already-initialized lower-tier project (e.g. `--tier intermediate` over a `--tier minimal` install) now layers the higher tier on top, as the minimal tier's printed upgrade path promises, instead of refusing with "Project already initialized". The upgrade writes only files that do not exist, never overwrites adopter-edited files, merges `harness.config.json` non-destructively (every existing key keeps its value; the higher tier's keys are added; `template.level` moves to the new tier), and re-ensures `.harness/.gitignore`. Re-running at the same or a lower tier is refused with a tier-aware message, a bare `harness init` (no explicit tier) still refuses, and `--force` semantics are unchanged.
