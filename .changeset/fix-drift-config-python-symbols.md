---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(entropy): honor `entropy.drift` config on the entropy/CI paths and resolve Python symbols

The api-signature doc-drift detector flooded non-TS projects with false
positives and offered no honored way to scope or disable it.

- **Config now threaded (issue #723).** `detect_entropy` (MCP), `run_ci_checks
entropy`, and `harness cleanup` previously built the analyzer with
  `analyze.drift` as a boolean, so it always fell back to
  `DEFAULT_DRIFT_CONFIG`. The CLI config schema also had no place to put drift
  settings. A new `entropy.drift` block (`checkApiSignatures`, `ignorePatterns`,
  `forwardLookingPaths`, `checkStructure`, `docPaths`) is now validated and
  threaded into `analyze.drift` at all three call sites. The MCP handler now
  loads `harness.config.json`, which also fixes `assess_project`.

- **Python symbols now resolve.** The tree-sitter Python export extractor
  matched raw node types on `module.children`, missing decorated classes
  (`@dataclass`), top-level constants, and all class-body members (dataclass
  fields, enum members, methods) — so documented references to them were
  wrongly flagged as api-signature drift. Extraction now unwraps
  `decorated_definition` / `expression_statement` and descends one level into
  class bodies. Underscore-prefixed members stay private.
