---
slug: "multi-language-code-graph-coverage-and-published-resolution-tiers"
milestone: "Intake"
order: 44
---

### Multi-language code-graph coverage and published resolution tiers

- **Status:** planned
- **Spec:** —
- **Summary:** Widen code-graph language coverage and publish per-language resolution quality, so adopters know what the graph will actually give them. Harness resolves **6** languages — `typescript, javascript, python, go, rust, java` (`packages/core/src/code-nav/types.ts:4`) — and publishes no per-language quality figure. `DeusData/codebase-memory-mcp` (38.3k, MIT) resolves **13** languages with Hybrid LSP semantic type resolution (Python, TS/JS/JSX/TSX, PHP, C#, Go, C, C++, Java, Kotlin, Rust, Perl), parses **158** via vendored tree-sitter grammars, and publishes tiered quality (Excellent / Good / Functional) benchmarked against 64 real repositories with a stated ~95% resolution target on idiomatic code. Consequence today: an adopter on a Kotlin, C#, PHP or Ruby codebase gets a materially thinner graph than a TypeScript adopter, and nothing surfaces that — every downstream capability that reads the graph (impact analysis, blast radius, review scoping, test selection, hotspot detection) silently degrades with it. Directly gates the External adoption flywheel track, since the constraints-as-code thesis can only be tested at scale on codebases the graph can actually read. High effort and deliberately scored as such; the cheap first increment is publishing honest per-language tiers for the 6 already supported. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 2.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1284
