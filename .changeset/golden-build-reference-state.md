---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add the `harness golden-build` reference-state primitive.

A golden build is the canonical known-good reference state of the repo — an
immutable, tag-like snapshot, distinct from the per-metric baselines (arch,
coverage, benchmark) which are moving numeric ratchets. It answers "is the repo
still the exact known-good shape we last trusted?" rather than "did metric X
regress?".

The snapshot is a composite fingerprint (SHA-256 per reference file) over a
configurable set of reference files — by default the three metric-baseline files
plus dependency/config identity anchors (`package.json`, the lockfile, the
harness config). Hashing the baseline files means a golden sits _above_ them:
a baseline rewrite moves the golden fingerprint too.

Three subcommands:

- `harness golden-build promote` — snapshot the working tree to
  `.harness/golden/manifest.json`. Byte-stable: a re-promote whose fingerprint
  is unchanged leaves the manifest untouched (informational provenance —
  `promotedAt`/`commit`/`branch` — is ignored by comparison and only refreshed
  when the fingerprint actually changes).
- `harness golden-build verify` — compare the working tree against the golden
  and exit non-zero on any drift (changed, missing, or added reference file).
- `harness golden-build diff` — explain what has drifted since the last golden
  (advisory; always exits 0).

Configurable via an optional `golden` config block (`manifestPath`,
`referencePaths`) and a repeatable `--path` override on every subcommand.
