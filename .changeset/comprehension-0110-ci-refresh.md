---
'@harness-engineering/cli': minor
---

feat(comprehension): opt-in token-gated CI semantic refresh — the automated
alternative provider (ADR 0110 §3, `Closes #1689`). Stacks on the single-writer
core (#1713): where the default is a maintainer running `harness comprehend --all`
locally, this adds the automated equivalent for teams that want CI to keep the
committed semantic substrate fresh on a keyed runner.

- **`comprehend --refresh`** — a new run mode and the authoritative in-CLI gate. It
  performs the single-writer main-pass (regenerate + stage committed semantic) ONLY
  when all three signals hold: `comprehension.ci: refresh` is configured, this is
  the `main` main-pass, and a provider credential resolves. A new pure
  `comprehension/refresh-gate.ts` (`resolveRefreshJobGate`) makes the decision and
  reports the first missing prerequisite. Provider-neutral — the credential is
  whatever `resolveAnalysisProvider` resolves (Anthropic key, a config-declared
  OpenAI-compatible endpoint, or the claude CLI), never a forced Claude model.
- **Off by default.** Every inactive branch is a clean no-op (exit 0) — a default
  adopter (`ci: verify`, no secret) sees zero new behavior and CI stays token-free
  (the ADR-0109 invariant). `ci: refresh` set but no credential degrades to a
  token-free no-op with an actionable `::warning::`, never a red merge.
- **New CI job `comprehension-refresh`** — runs POST-MERGE on `main` only (never in
  a PR context), gated behind a repo variable `HARNESS_COMPREHENSION_CI_REFRESH`
  plus the in-CLI gate, and commits the refreshed `.harness/comprehension/**` shards
  via the github-actions[bot] with `[skip ci]`. Loop-safe by construction (skip-ci
  and idempotent regeneration).
