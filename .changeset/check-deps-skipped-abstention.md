---
'@harness-engineering/cli': major
---

`harness check-deps` no longer reports clean and exits 0 over an analysis that examined nothing.

The command had two ways to do that. One is reachable today; the other is not, and this changeset says which is which.

## Reachable: no `layers` configured skipped the cycle check too

`runCheckDeps` opened with `if (!config.layers || config.layers.length === 0) return Ok(result)` — `valid: true` over `modulesAnalyzed: 0`. That early return also skipped **circular-dependency detection, which needs no layers at all**. On a 2-file project with a genuine `a.ts -> b.ts -> a.ts` cycle and no `layers` block, the built CLI printed `Analyzed 0 module(s) across 0 layer(s).` / `v validation passed`, `--json` gave `{"valid": true, "issues": [], "modulesAnalyzed": 0}`, `--findings-json` gave `{"findings":0}`, and the exit code was `0`.

Layer validation is now scoped to the half that needs layers, and the file sweep and cycle check run regardless. **This is the breaking part, and it is the reason for the `major`:** an adopter with no `layers` block and an existing import cycle goes from exit `0` to exit `1` with no change to their code. Cycles have never been reported for them, so this can surface cycles of any age. A zero-module result is still distinguished by cause: a scope that was given and matched nothing (configured layer patterns, or a `deps.exclude` that swallowed every file) abstains and refuses to report clean, while a project that contains no analysable source is "not applicable" and stays at exit 0.

**The layerless sweep is not free.** With no `layers` block the discovery set is every `ts/tsx/mts/cts/js/jsx/mjs/cjs` file under `rootDir`, which includes tests and fixtures, and `deps.exclude` is the only lever for narrowing it. Each discovered file is parsed for the cycle check: on this repository that is 2,648 modules. A layerless project that previously paid nothing for `check-deps` now pays a full-project parse.

## Not reachable in production: the parser-unavailable abstention

`validateDependencies` abstains when the parser is unavailable — `skipped: true` with a reason — and `check-deps` discarded that flag, so an abstention was indistinguishable from a clean repository. `check-deps` and the `check_dependencies` MCP twin now report it on the "checks that could not run" channel: in the text output, in `--json` as `unavailableChecks`, in the `--findings-json` count, and with exit `3` (`ZERO_DENOMINATOR` — the command ran but examined nothing), deliberately distinct from `0`, `1` (violations) and `2` (engine malfunction). `deps.fallbackBehavior: "warn"` keeps exit `0` while still reporting the abstention; the default is `"skip"` and `"error"` fails hard.

**No adopter can observe this half today.** `TypeScriptParser.health()` is hardcoded to `{ available: true }`, and `check-deps` and the MCP handler both construct `new TypeScriptParser()` unconditionally, so no production path yields `skipped: true` and the exit-3 branch cannot fire. The coverage for this half reaches it by mocking the core export. It is the correct contract for the day `health()` becomes honest, which is tracked in #2267 — it is not a change an adopter's pipeline will notice now.

The MCP handler was unreachable for a second, independent reason, which this change does fix: `architecture.ts` called `validateDependencies` with no `fallbackBehavior`, so core's default `'error'` applied and an unavailable parser returned `Err` rather than `Ok({skipped: true})` — and the documented `deps.fallbackBehavior` config was ignored on the MCP surface entirely. It now loads and passes the policy, defaulting to `skip` like `check-deps`. One asymmetry remains by design: the MCP twin returns `isError: true` on an abstention regardless of `fallbackBehavior`, so `"warn"` downgrades the CLI's exit code but not the MCP result — an MCP caller has no exit code to downgrade, and a tool result that looks successful is the defect being fixed.

Runs where the engine actually ran and layers are configured are unchanged, byte for byte.
