# Skill Advisor — Compiled Comprehension Substrate

Scanned 783 skills. No Apply-tier matches (novel infrastructure feature); the
strongest matches are general TypeScript/pattern references useful during
implementation.

## Reference

| Skill | Score | When |
|-------|-------|------|
| ts-zod-integration | 0.56 | Architecture decisions — the `SemanticUnit` `responseSchema` and config schema are Zod |
| ts-testing-types | 0.56 | Testing — store/compiler/gate unit tests |
| ts-performance-patterns | 0.55 | During implementation — input bounding, bounded concurrency, token budget |
| gof-chain-of-responsibility | 0.54 | Architecture — the provider-resolution precedence chain (D8) |
| ts-type-guards | 0.54 | During implementation — frontmatter/unit parsing guards |
| ts-template-literal-types | 0.54 | Architecture decisions |
| gof-memento-pattern | 0.50 | Testing |
| gof-builder-pattern | 0.48 | Architecture decisions |
| node-http-server | 0.48 | During implementation |
| gof-facade-pattern | 0.46 | Architecture decisions — `ComprehensionStore` facade over shard IO |

## Harness pipeline skills for the build (not from the content scan, but the path this spec takes)

- **harness-planning / harness-autopilot** — break the 6 phases into tasks and execute.
- **harness-soundness-review** — already run against this draft (converged; all findings applied).
- **harness-tdd** — phases 1–2 (core compiler, store, hash gate) are pure and test-first.
