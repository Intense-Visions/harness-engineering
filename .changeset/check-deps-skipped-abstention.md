---
'@harness-engineering/cli': major
'@harness-engineering/core': patch
---

`harness check-deps` no longer reports clean and exits 0 over an analysis that examined nothing.

The command had two ways to do that. One is reachable today; the other is not, and this changeset says which is which.

## Reachable: no `layers` configured skipped the cycle check too

`runCheckDeps` opened with `if (!config.layers || config.layers.length === 0) return Ok(result)` — `valid: true` over `modulesAnalyzed: 0`. That early return also skipped **circular-dependency detection, which needs no layers at all**. On a 2-file project with a genuine `a.ts -> b.ts -> a.ts` cycle and no `layers` block, the built CLI printed `Analyzed 0 module(s) across 0 layer(s).` / `v validation passed`, `--json` gave `{"valid": true, "issues": [], "modulesAnalyzed": 0}`, `--findings-json` gave `{"findings":0}`, and the exit code was `0`.

Layer validation is now scoped to the half that needs layers, and the file sweep and cycle check run regardless. **This is the breaking part, and it is the reason for the `major`:** an adopter with no `layers` block and an existing import cycle goes from exit `0` to exit `1` with no change to their code. Cycles have never been reported for them, so this can surface cycles of any age. A zero-module result is still distinguished by cause: a scope that was given and matched nothing (configured layer patterns, or a `deps.exclude` that swallowed every file) abstains and refuses to report clean, while a project that contains no analysable source is "not applicable" and stays at exit 0.

## Not reachable in production: the parser-unavailable abstention

`validateDependencies` abstains when the parser is unavailable — `skipped: true` with a reason — and `check-deps` discarded that flag, so an abstention was indistinguishable from a clean repository. `check-deps` and the `check_dependencies` MCP twin now report it on the "checks that could not run" channel: in the text output, in `--json` as `unavailableChecks`, in the `--findings-json` count, and with exit `3` (`ZERO_DENOMINATOR` — the command ran but examined nothing), deliberately distinct from `0`, `1` (violations) and `2` (engine malfunction). `deps.fallbackBehavior: "warn"` keeps exit `0` while still reporting the abstention; the default is `"skip"` and `"error"` fails hard.

**No adopter can observe this half today.** `TypeScriptParser.health()` is hardcoded to `{ available: true }`, and `check-deps` and the MCP handler both construct `new TypeScriptParser()` unconditionally, so no production path yields `skipped: true` and the exit-3 branch cannot fire. The MCP handler is additionally unreachable because `architecture.ts` calls `validateDependencies` without a `fallbackBehavior`, so core's default `'error'` applies and an unavailable parser returns `Err`, never `Ok({skipped: true})`. The coverage for this half reaches it by mocking the core export. It is the correct contract for the day `health()` becomes honest, which is tracked in #2267 — it is not a change an adopter's pipeline will notice now.

## core: two collectors dropped the abstention

`LayerViolationCollector` and `ForbiddenImportCollector` call `validateDependencies` with `fallbackBehavior: 'skip'` — the one policy that can return `skipped: true` — and read only `violations`, emitting `{ value: 0, violations: [] }` for an analysis that abstained. They now record it on the same `metadata` channel their `!result.ok` branch already uses. Nothing downstream consumes it yet: `check-arch` compares `value` against a baseline and has no abstention channel, so this is a record rather than a gate, and is tracked in #2268. `patch` for exactly that reason.

Runs where the engine actually ran and layers are configured are unchanged, byte for byte.
