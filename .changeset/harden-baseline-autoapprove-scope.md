---
---

Harden the CI baseline self-approval scope (#531). The refresh-baselines job self-approves its own PR with `BASELINE_AUTOAPPROVE_PAT` when branch protection blocks a direct push; it now runs a fail-closed diff-scope guard (`scripts/assert-baseline-only-diff.mjs`) that aborts before approval if the PR touches any file outside the job's `$BASELINE_FILES` allowlist (or if the diff is empty). The allowlist is an exact path set, not a `*-baselines.json` glob, so the two bare `baselines.json` arch files are not wrongly rejected. Operational-security policy change to CI auto-approval; no package API change, no release intended.
