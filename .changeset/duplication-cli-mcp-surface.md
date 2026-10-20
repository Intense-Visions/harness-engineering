---
'@harness-engineering/cli': minor
---

Duplication detection reaches the operator: `harness cleanup -t duplication` and the
`detect_entropy` MCP tool's `type: "duplication"` report whole-unit Type-2 clone classes
(>= 3 members, >= 40 normalized tokens, ranked `tokenCount x members`).

Both surfaces are **advisory**. Clone classes never enter `CleanupResult.totalIssues`, so they
never affect the command's exit code and never appear in the `--findings-json` maintenance
contract; on the MCP side they are reported under `advisory.duplication`, outside
`totalIssues`. Because `-t duplication` runs no doc-drift, dead-code or pattern analyzer, the
command now prints "Entropy issues: not checked" instead of a green-ticked zero over three
checks that never ran.

`entropy.duplication` in `harness.config.json` is a new validated config block
(`minTokens`, `minInstances`, `ignorePatterns`, `maxClasses`). It was previously stripped by
the config schema with an "ignored unknown key" warning, so operator tuning could not reach
the detector at all. `minInstances` has a floor of 2 (the detector hard-skips groups below 2,
so 1 silently means "report every pair") and `maxClasses` must be positive (`0` reported zero
classes while counting every one of them as truncated). **`ignorePatterns` REPLACES the
shipped 21 default globs rather than appending to them** — a project that sets one pattern
stops ignoring tests, fixtures, generated output, `dist` and `node_modules` unless it restates
them.

The block's PRESENCE is the opt-in for `-t all` / `type: "all"`, so unconfigured projects see
no change; an explicit request runs on the shipped defaults. `entropy.duplication: false` plus
an explicit request REFUSES rather than reporting a clean scan that never ran, and a detector
that could not execute (for example a graph-fed run that bypassed the codebase snapshot) is
reported with the analyzer's own reason instead of an empty result.

`detect_entropy`'s payload no longer carries `duplication.byMember`: it is a `Map`, which
`JSON.stringify` rendered as `{}` — indistinguishable from an empty index. Its contents are
already in `classes[].members`.
