# Plan — Dogfood `harness roadmap install-hook` in this repo's own pre-commit (#1079)

Follow-up to #688 / PR #1078. This repo's `.husky/pre-commit` regenerated
`docs/roadmap.md` from shards via a hand-maintained **bespoke** step. PR #1078
shipped the adopter-facing installer `harness roadmap install-hook`, which writes
an equivalent **managed fenced block** from a single source of truth
(`buildRegenBlock`). Two implementations of the same logic drift, and the adopter
path was never exercised by harness's own hook.

## Goal

Replace the bespoke regen step with the installer's managed block so harness's own
hook **is** the installer's output — one source of truth, adopter path dogfooded.

## Brainstorming outcome (approach selection)

- **Rejected:** hand-copy `buildRegenBlock`'s text into the hook. Still two
  literals that drift; defeats the purpose.
- **Rejected:** change the installer default to the local bin. The `npx harness`
  default is correct for _adopters_; only _this_ repo needs the local build.
- **Chosen:** run the real installer with `--command` overriding the npm default
  to the local workspace build, and add a test that pins the hook to
  `buildRegenBlock(localCommand)` so future drift fails CI.

## Tasks

1. Remove the bespoke roadmap-regen block from `.husky/pre-commit`; leave a short
   comment explaining the dogfooding and the `--command` override rationale. Keep
   every other hook step (arch gate, lint-staged, plugin-artifact regen,
   block-no-verify, node-pin) untouched.
2. Run:
   `harness roadmap install-hook --command 'node packages/cli/dist/bin/harness.js roadmap regen'`
   — writes the managed fenced block at the end of `.husky/pre-commit`. The
   `--command` override is **critical**: the default `npx harness roadmap regen`
   pulls the regen logic from npm, which is wrong for this repo; it must run the
   local workspace build.
3. Add `packages/cli/tests/hooks/pre-commit-dogfood-managed-block.test.ts`: assert
   the committed hook contains exactly one managed block, its body equals
   `buildRegenBlock('node packages/cli/dist/bin/harness.js roadmap regen')`, the
   command is the local bin (never the `npx` default), and no leftover bespoke
   step remains.

## Verification

- New drift-guard test passes.
- Existing `roadmap-regen-hook.e2e.test.ts` still passes — it extracts the regen
  block verbatim from `.husky/pre-commit` (slicing from the `^docs/roadmap\.d/`
  guard line to EOF) and runs it through a real `git commit`; the managed block
  keeps that guard line and stays the last block, so the extraction is unchanged
  and the fail-safe (block-the-commit-on-regen-failure) behavior is preserved.
- `harness roadmap regen` is deterministic + prettier-clean → `docs/roadmap.md`
  stays undirtied, so the changed hook passes on its own commit.
- Full pre-commit hook runs green end-to-end on this change's commit.

## Assumptions

- Used the local-bin `--command`, not the `npx` npm default.
- Sequenced #1079 before #1235 (which also rewrites this regen step). #1235 is not
  in this batch and has no open PR, so there is no in-flight conflict; whoever
  builds #1235 rebases onto this managed block. Tracked by #1268.
