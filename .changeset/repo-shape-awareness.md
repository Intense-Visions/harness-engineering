---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
---

feat(analysis): repo-shape awareness — `analysis.exclude` config + pytest support in test-craft (#898)

Analysis tooling assumed a JS/single-app repo shape. On toolset/overlay repos
(mixed Python + TS, vendored dirs, flat script sets) the entropy/graph
scanners were noise-dominated and test-craft silently skipped whole Python
test suites. Two changes:

**Project-wide `analysis.exclude` config (precedent: `design.exclude`):**

- New optional top-level `analysis.exclude` glob list in `harness.config.json`,
  applied ON TOP of each scanner's own excludes so vendored/generated paths
  are declared once. Honored by `detect_entropy`, `run_security_scan`, graph
  code ingestion (`harness graph scan` / `ingest` and the `ingest_source` MCP
  tool — the latter previously ignored `ingest.*` config entirely), and the
  CI check orchestrator (docs, entropy, and security checks).
- `runEntropyCheck` in the CI orchestrator now passes `entropy.excludePatterns`
  through to the analyzer (previously dropped on that path).
- `DEFAULT_FIND_FILES_IGNORE` (core `findFiles`) is now sourced from the
  shared `DEFAULT_SKIP_DIRS` walker skip-list instead of a drifted 4-entry
  copy — `.venv`, `venv`, `__pycache__`, `vendor`, caches, and AI-agent
  sandboxes are excluded consistently across every scanner sharing the walker.

**test-craft learns pytest (fifth framework):**

- Discovery now matches `test_*.py` / `*_test.py` (skipping `__pycache__`,
  `venv`, `vendor`); extraction is a light-parse (regex + indentation) walk
  capturing `def test_*` functions, `class Test*` nesting, and
  `@pytest.mark.skip/skipif` markers into the same `ExtractedTest` shape the
  critique pipeline already consumes — the 8 seed rubrics are
  language-agnostic and apply unchanged.
- Source pairing understands Python conventions (`tests/test_foo.py` →
  `src/foo.py`, sibling, and flat-package layouts).
- `pytest` joins the `frameworks` filter on the CLI (`--frameworks pytest`),
  the MCP tool enum, and `frameworksDetected` in the summary — so Python
  suites are critiqued instead of silently reporting an empty pass.
