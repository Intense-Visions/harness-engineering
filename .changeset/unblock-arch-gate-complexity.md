---
'@harness-engineering/cli': patch
---

Reduce `parseFencedJson` complexity in `docs-craft/phases/critique.ts` past the
arch gate's new-code threshold (cyclomaticComplexity 12 > 10), which was blocking
all commits on `main` (#1087). Fence-stripping and object-narrowing are extracted
to `stripJsonFence` and `asJsonObject`, leaving the parser as try/catch plus two
calls. Behaviour is unchanged and the `SEC-DES-001` ignore comment is retained,
now pointing at `asJsonObject` where the shape gate lives.
