---
'@harness-engineering/core': patch
---

Stop the CWE-798 secret detector flagging command-substitution values as
hardcoded secrets.

The reference-vs-literal guard already suppressed variable references
(`$NAME`, `${NAME}`, `${NAME:-default}`) and CI expressions
(`${{ secrets.X }}`). It still flagged a quoted **command substitution**, whose
value is produced by running a command at runtime rather than embedded in
source, e.g. `GH_TOKEN="$(gh auth token)"` or the backtick form. That fired a
blocking `critical` on the ordinary, shellcheck-clean way to pass a token to a
subcommand in a CI workflow.

`isReferenceOnlySecretValue` now strips single-level `$( ... )` and backtick
`` ` ... ` `` substitutions before its literal-residue check, so both the
heuristic review-tier detector and the deterministic `SEC-SEC-*` rules stop
mis-firing. Genuine literals — including a command substitution mixed with a
literal suffix (`"$(id)-sk-live-..."`) and nested substitutions — are still
detected.
