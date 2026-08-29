---
'@harness-engineering/cli': minor
---

comprehension: add the `comprehension` git merge driver (ADR 0109, slice 5). Comprehension `_module.md` shards are a pure function of their module's source, so a conflict is resolved by REGENERATING from the merged source rather than a hand-merge. `harness init` now configures `merge.comprehension.driver`, and a `.gitattributes` entry maps `.harness/comprehension/**/_module.md` to it. The driver (internal `comprehension-merge-driver` command) recompiles the shard static-only from the working-tree source and is always non-blocking — any fallback keeps "ours" and is healed later by `comprehend --check`. Combined with byte-stable shards (slice 1), developers never resolve a comprehension merge marker.
