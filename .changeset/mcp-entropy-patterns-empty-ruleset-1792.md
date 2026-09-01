---
'@harness-engineering/cli': patch
---

fix(mcp): stop `detect_entropy(type: "patterns")` from reporting a false pass over zero rules (#1792)

The MCP entropy tool passed `patterns` as a bare boolean, which the `EntropyAnalyzer` coerces into an empty rule set (`{ patterns: [] }`) — evaluating zero pattern rules yet reporting zero violations, a pass indistinguishable from a real check that found nothing. This is the same empty-ruleset false-pass fixed on the CLI `harness cleanup -t patterns` path in #1760 (PR #1791). The tool now reads pattern rules from the `entropy.patterns` config block, threads the configured rules into the analyzer, and fails loudly (`isError`) when `type: "patterns"` is requested with no rules configured instead of green-ticking an empty check. For `type: "all"`, patterns are skipped when unconfigured, preserving the common no-config path.
