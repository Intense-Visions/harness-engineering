---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(core, cli): track `.harness/hooks/` and `.harness/security/timeline.json` by default (#270)

Two pieces of harness state are team-shared but were ignored by the `.harness/.gitignore` that `harness init` scaffolds, so a fresh clone ran without policy enforcement and with no shared security-trend history until someone re-ran `harness init`:

- **`.harness/hooks/`** — the per-profile policy scripts (`block-no-verify.js`, `protect-config.js`, `quality-gate.js`, `pre-compact-state.js`, `adoption-tracker.js`, `telemetry-reporter.js`, plus `profile.json` for `standard`; `cost-tracker.js`, `sentinel-pre.js`, `sentinel-post.js` add for `strict`). Treat the directory like a tracked lockfile: review CLI-upgrade diffs.
- **`.harness/security/timeline.json`** — append-only security trend ledger keyed by commit hash. Tracking it surfaces score deltas in PR diffs and gives `findingLifecycles` a real audit trail.

**`@harness-engineering/cli`:**

- `packages/cli/src/templates/post-write.ts` — `ensureHarnessGitignore` no longer emits `hooks/`, and replaces `security/` with `security/*` + `!security/timeline.json`.
- `packages/cli/tests/templates/post-write.test.ts` — adds two assertions that pin the new semantics so future edits cannot silently revert them.

**`@harness-engineering/core`:**

`security/timeline.json` was not actually share-safe before this change: `findingLifecycles[].file` stored whatever path the scanner emitted, which is absolute (`packages/cli/src/commands/check-security.ts:90` globs with `absolute: true`). Committing it would have leaked every developer's home-directory username and produced near-guaranteed merge conflicts whenever two developers scanned. The CLI default flip is paired with a normalization fix at the timeline boundary:

- `packages/core/src/security/security-timeline-manager.ts` — `capture()` and `updateLifecycles()` now relativize `finding.file` against `rootDir` before computing `findingId` and persisting, so IDs are rootDir-independent (two clones agree). Paths that escape `rootDir` (relative starts with `..`) are passed through unchanged so we never silently misattribute findings outside the project.
- `load()` migrates legacy absolute paths under `rootDir` to repo-relative form on first read and re-saves the file. One-shot fixup; subsequent reads are no-ops.
- `packages/core/tests/security/security-timeline-manager.test.ts` — six new cases under `describe('path normalization (issue #270)')` covering: absolute→relative on write, no-double-strip on already-relative, rootDir-independent IDs across two managers, escape-paths preserved, on-load migration with re-save, and no-op when paths are already clean.

**Repo dogfood:**

- `.gitignore`, `.harness/.gitignore`, `packages/cli/.harness/.gitignore` — flipped to the new template form.
- `.harness/security/timeline.json`, `packages/cli/.harness/security/timeline.json` — migrated from absolute to relative paths and now tracked.
- `.harness/hooks/` — now tracked (7 standard-profile entries).
