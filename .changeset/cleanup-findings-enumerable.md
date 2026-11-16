---
'@harness-engineering/cli': patch
'@harness-engineering/types': patch
---

fix(cli): `harness cleanup` findings are now enumerable (#2133) and dead-code findings keep their `reason` (#2076).

- `--findings-json` adds an `items` array to the trailing `{ findings, check, v }` line: every gating finding (drift, dead code, pattern violations — exactly what `findings` counts, so `items.length === findings`) with `kind`, `file`, `line` where it has one, and the drift `type` / dead-code `symbol` + `reason` / pattern `pattern` + `message`. Existing fields are unchanged; clone classes stay excluded (ADR 0134).
- `formatFindingsContract` takes an optional third `items` argument and `parseFindingsContract` returns `items` when the envelope carries them. Additive; count-only producers and consumers are unaffected.
- The human report prints each dead-code row's reason (`[PUBLIC_API_UNUSED]`, `[UNREFERENCED_ENTRY_POINT]`, ...), so non-deletable findings no longer render like deletable ones, and the elision line now says where the rest are: `... and N more (full list: --findings-json or --json)`.
- `--json`'s `deadCode[]` gains `reason` (and `line` for dead exports); `patternViolations[]` gains `line`.
