---
type: business_concept
domain: core
tags: [entropy, dead-code, drift, coupling, complexity]
---

# Entropy Detection

The entropy module identifies four classes of structural rot that accumulate over time in the codebase.

## Detection Categories

1. **Documentation Drift** — API signatures, examples, or structure docs that have become stale or reference non-existent code. Classified by confidence (high/medium/low) and type (api-signature, example-code, structure).

2. **Dead Code** — Exports with no importers, files unreachable from entry points, internal functions never called, and unused imports. Reports reachability tree for understanding impact.

3. **Pattern Violations** — Custom pattern rules (e.g., naming conventions, async labeling) that are analyzed and reported with violation counts.

4. **Coupling and Complexity** — Quantifies tight coupling between modules (fan-in/fan-out) and cyclomatic complexity, measured against configurable target thresholds and size budgets.

## Configuration

Entropy detection is configured in `harness.config.json` under the `entropy` key with exclude patterns and entry points. The `autoFix` flag (default false) controls whether safe fixes are applied automatically during detection runs.
