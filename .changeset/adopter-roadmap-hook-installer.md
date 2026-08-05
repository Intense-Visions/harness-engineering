---
'@harness-engineering/cli': patch
---

Add `harness roadmap install-hook` — an adopter-facing installer for the roadmap
aggregate-regeneration git hook (#688).

Projects that shard their roadmap (`docs/roadmap.d/`) keep the generated
`docs/roadmap.md` aggregate fresh with a `pre-commit` step that runs `harness
roadmap regen`. This command installs that step into an adopter's own hook,
composing safely with an existing husky (`.husky/pre-commit`) or raw
`.git/hooks/pre-commit` setup. It is idempotent (a fenced managed block is
replaced in place, never duplicated, and never clobbers the adopter's own hook
steps) and degrades gracefully when the project is not sharded (skips unless
`--force`). CI (`harness validate`) remains the authoritative freshness contract;
this hook is a local developer convenience.
