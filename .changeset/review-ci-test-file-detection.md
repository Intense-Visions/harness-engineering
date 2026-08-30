---
'@harness-engineering/core': patch
---

review-ci: fix "No test files found" false finding on diffs that add or modify test files (#1501). The bug-detection agent now credits `*.test.*` / `*.spec.*` / `*_test.*` files present in the diff itself — not only those pulled in as review context — so a PR whose purpose is adding tests is no longer told it has none. The source classifier that lists "files without tests" now also excludes test-support scaffolding (anything under `test/` / `tests/` / `__tests__/` / `__mocks__/` / `fixtures/`, `*-testkit.*`, `conftest.py`) and non-code files (`.md`, `.json`, lockfiles, etc.), so a `CHANGELOG.md` no longer reaches the classifier or attracts a file-size complaint.
