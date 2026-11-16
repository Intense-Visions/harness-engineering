---
'@harness-engineering/cli': patch
---

fix(naming-craft): skip files in languages the extractor cannot parse instead of emitting phantom identifiers

naming-craft extracts identifiers with the TypeScript Compiler API, but explicit `files: [...]` bypassed the walker's extension filter, so a PHP file was parsed as TSX: the namespace path in `use function RPB\X\y;` surfaced as a `function` named `RPB`, and every PHP identifier was judged against the convention sampled from the repository's TypeScript (e.g. `PascalCase` applied to snake_case WordPress functions). Non-TS/JS files are now reported in `summary.unsupportedFiles` (and on the collect output), never extracted, never critiqued, and never counted in the convention sample; the CLI diagnostic counts them as skipped. Closes #1967.
