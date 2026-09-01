---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(dictionary): trained context dictionaries — a governed, versioned codebook
for recurring knowledge (#1635).

Adds a pure `dictionary` module to `core` that mines recurring spans over a
corpus of past assembled contexts, scores each candidate by `frequency × length`
against an amortization threshold (with a net-saving guard), and reconciles a
**governed, versioned codebook**: every term is bound to a verified definition
with a version, expansion is deterministic, and a definition change bumps the
version while retaining the prior version so a consumer that pinned it never
silently holds a stale meaning. Membership is decided purely by measurement —
a term enters when it crosses the threshold and retires when usage decays
(hysteresis; no hand-curated list) — and a stale-reference audit classifies
consumer pins. Exposes it as a read-only `harness context-dictionary report`
subcommand (`--json`, `--write`) that trains over this repo's committed
comprehension corpus.

Scope note: this slice is training + reporting only. Wiring handle-substitution
into the serving/assembly path is deferred to a follow-up (see `Refs #1635`).
