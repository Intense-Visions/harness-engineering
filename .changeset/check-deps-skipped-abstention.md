---
'@harness-engineering/cli': major
---

`harness check-deps` no longer reports clean and exits 0 when its analysis engine validated nothing.

`validateDependencies` already abstains when the parser is unavailable — it returns `skipped: true` with a reason. No consumer read that flag, so the CLI saw a success with zero violations and could not tell it from a genuinely clean repository: `valid: true`, `{ "findings": 0 }`, exit `0`. `harness check-deps && deploy` proceeded on a check that never ran; the only trace was a `console.warn` on stderr.

**Behaviour change for adopters.** An abstained run is now reported on the "checks that could not run" channel — in the text output, in `--json` as `unavailableChecks`, and in the `--findings-json` count — and exits `3` (`ZERO_DENOMINATOR`: the command ran but examined nothing), which is deliberately distinct from `0`, from `1` (violations found), and from `2` (the engine malfunctioned). A pipeline that was silently green on an unrunnable check will now go red. That is the defect being fixed, but it surfaces in the adopter's CI.

**Escape hatch:** set `deps.fallbackBehavior: "warn"` in `harness.config.json` to keep the previous exit `0` while you repair the setup — the abstention is still reported, only the exit code is downgraded. The default is `"skip"`; `"error"` makes the engine fail hard instead (exit `2`).

The MCP twin `check_dependencies` reads the same flag and returns an error naming the abstention instead of a clean-looking payload.

Runs where the engine actually ran are unchanged, byte for byte: no `unavailableChecks` key, same exit codes.
