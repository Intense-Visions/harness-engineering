---
'@harness-engineering/cli': patch
---

Fix the release workflow invoking pnpm's built-in `version` command instead of the `version` script.

`version` is a built-in pnpm command, so the `version: pnpm version` input passed to `changesets/action` resolved to the built-in — which only prints a version dictionary — and never ran package.json's `version` script. The release bumped nothing, so `changeset-release/main` came out byte-identical to `main` and the action failed creating its PR with `Validation Failed: No commits between main and changeset-release/main`.

Corrected to `pnpm run version`, which invokes the script (`changeset version && node scripts/sync-plugin-pin.mjs`). The sibling `publish: pnpm release` input was never affected because `release` is not a built-in pnpm command and therefore falls through to `run`.
