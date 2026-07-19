---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(arch): give the architecture ratchet a noise tolerance so merging `main` stops forcing `baselines.json` rewrites

The architecture baseline flagged a regression on _any_ aggregate increase
(strict `agg.value > baselineValue` in `diff()`), while the coverage and
benchmark ratchets already absorb run-to-run jitter with a tolerance. That
asymmetry made `baselines.json` a constant merge-conflict source: when a branch
merged `main`, main's legitimately-grown totals (e.g. total complexity 283→284,
module size +119 bytes) counted as _the branch's_ regression against its now
stale baseline, so the pre-commit gate forced `check-arch --update-baseline`.
Every concurrent PR rewrote the file to slightly different values and they
conflicted with each other — and because `.gitattributes` `merge=ours` is inert
on GitHub's server-side merge, they conflicted there too.

`ArchConfig` now carries a `regressionTolerance` (fraction, default `0.01`).
`diff()` accepts it and allows `baselineValue + floor(baselineValue * tolerance)`
before reporting a regression, so sub-tolerance merge drift no longer trips the
gate. It self-scales: 1% of a ~300 complexity total is ~3, but 1% of a max-depth
of 5 floors to 0, so shallow-integer metrics stay strict. Genuine regressions
(which move the aggregate far past the tolerance) still fail. `diff()` defaults
to a strict `>` when no tolerance is supplied, so the pure-function contract is
unchanged.

Also makes the no-release changeset marker robust to prettier: the empty-marker
detector in `scripts/check-changesets.mjs` now parses frontmatter by line and
accepts both `---\n\n---` and prettier's collapsed `---\n---`, so no-release
markers no longer need a per-PR `.prettierignore` entry (those entries were
themselves a recurring conflict source).
