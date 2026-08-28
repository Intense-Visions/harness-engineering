---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

comprehension: shards are now byte-stable (ADR 0109). A compiled unit no longer carries a wall-clock `compiledAt` — it is a pure function of its source at `sourceHash`, so two branches that make the same change produce byte-identical `_module.md` shards and never collide in a merge. `compiledAt` becomes optional and is preserved only when reading a legacy shard that still carries it (it migrates away on the next recompile).
