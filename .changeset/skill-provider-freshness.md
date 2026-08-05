---
'@harness-engineering/cli': minor
---

External skill-provider freshness and install follow-through. `harness install` now
offers to run `generate-slash-commands` for you (TTY-gated, with `--generate` /
`--no-generate`) instead of only printing the hint. Skill installs record their source
provenance in a v2 lockfile (GitHub installs capture the resolved commit SHA; v1
lockfiles still load), and a background check passively nudges when a GitHub or npm
provider has upstream changes. A new `harness skill update [--check]` command re-pulls
outdated providers behind a per-provider consent prompt, and `harness update` surfaces
outdated providers alongside its existing offers. All freshness network behavior honors
the `HARNESS_NO_UPDATE_CHECK` kill-switch; nothing re-pulls upstream code without an
explicit confirmation.
