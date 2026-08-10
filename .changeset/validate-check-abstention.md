---
'@harness-engineering/cli': patch
---

fix(validate): a check that could not run no longer reports as passed

`harness validate` printed `validation passed` and exited `0` when `docs/roadmap.md`
existed but failed to parse. The `roadmapHealth` check was guarded by `if (parsed.ok)`
with no `else`, so on a parse failure every roadmap health rule (RMH001-RMH005) was
skipped at once, the parse error was discarded, and the verdict was never touched — a
roadmap broken beyond parsing validated clean while a _less_ broken one failed. The
aggregate-drift doctor carried the same swallow, reporting a freshness comparison as
passed when the shards could not be regenerated at all.

`harness validate` now has three outcomes instead of two. A check whose input exists
but cannot be consumed **abstains**: it is recorded in a new `unavailableChecks`
ledger, the result carries `complete: false`, and the command exits `3`
(`ZERO_DENOMINATOR` — "the command ran but examined nothing"), printing a
`Checks that could not run` section instead of a pass or fail verdict. Abstention
outranks failure, because exit `1` implies the reported findings are the complete
list. `--severity` never filters the ledger.

Existing behavior is unchanged otherwise: advisory findings such as RMH002 remain
warnings that do not fail validation, error findings still exit `1`, an absent
roadmap is still a silent no-op, and output for any run with no unavailable checks is
byte-identical to before.
