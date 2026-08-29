---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

comprehension: a shard's STATIC surface is now byte-stable (ADR 0109). A compiled unit no longer carries a wall-clock `compiledAt` — the static half is a pure function of its source at `sourceHash`, so two branches that make the same change produce byte-identical static `_module.md` shards and do not collide on the static surface. (The `semantic: present` half is agent-authored prose and remains non-deterministic; those collisions are handled by the comprehension merge driver, not by byte-stability.) `compiledAt` becomes optional and is preserved only when reading a legacy shard that still carries it (it migrates away on the next recompile).
