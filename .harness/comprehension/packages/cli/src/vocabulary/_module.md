---
schemaVersion: 1
module: 'packages/cli/src/vocabulary'
sourceHash: '8401620443999cbddd6f1368e6c1c2bf630871a92bbf3aab07aa9622c1c48cc0'
compiledAt: '2026-08-28T01:22:09.474Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['scanner.ts']
---

## Summary

`vocabulary` is the pure scanning engine behind the `harness check-vocabulary` gate—a linter that fails when deprecated or renamed canonical terms reappear in adopter skill/docs prose, guarding against vocabulary drift. The module resolves configured file globs, strips Markdown code fences and inline code spans (to avoid matching legitimate identifier mentions), and searches prose-only text for deprecated terms using case-insensitive word-boundary matching. Each rule can exempt legitimate occurrences via optional regex allowlists. Violations are reported with 1-based line numbers, file paths, and context excerpts. Ships in `@harness-engineering/cli` so adopters can run it against their own `harness.config.json` vocabulary blocks; pure logic is fully unit-testable against fixtures.

## Invariants

- Code-aware, prose-only scanning: fenced blocks (``` or ~~~) and inline code (backticks) are stripped before matching; line numbers preserved (blanked lines stay in place) so violations report accurate line positions — core design constraint for low false positives
- Word-boundary anchoring with whitespace normalization: terms matched as \b<escaped>\b with interior whitespace normalized to \s+, so 'code base' (or wrapped) still matches; case-insensitive
- Per-rule allow-regex exemption: optional `allow` patterns compiled case-insensitively and tested against original line (before code stripping); if any match, hit not reported — essential for archival/historical surfaces
- Line-index alignment through stripping: stripCode() blanks fenced/code lines instead of removing them, keeping indices 1:1 with original file; violation line numbers depend on this
- Deterministic, deduplicated file enumeration: resolveScanFiles() returns sorted, deduplicated absolute-path list; ensures consistent scan order and reproducible output
- Normalized, forward-slash paths in output: all violations report repo-relative paths with forward-slash normalization (no backslashes), even on Windows — cross-platform consistency

## Interface Contract

```ts
export formatViolations
export resolveScanFiles
export scanFiles
export scanText
```

## Dependency Slice

```
import { glob } from 'glob'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
```
