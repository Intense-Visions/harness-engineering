# Plan: Project-wide tiered E2E testing framework (slice 1)

- **Issue:** #1691 · **Route:** feature · **ADR:** 0111 (accepted)
- **Proposal:** `docs/changes/e2e-testing-framework/proposal.md`

Delivers the shared substrate ADR 0111 names, proves it on one flow, documents
it, and wires the nightly Tier B lane. Everything runs on the existing vitest +
turbo + OS-matrix CI — zero new runner, zero new published package.

## Task 1 — Shared E2E helper module

Create a package-neutral helper under `packages/cli/tests/e2e/support/` (co-located
where the first exemplar flow lives; authored with no cli-specific imports so a
later slice can promote it to a shared cross-package home):

- `harness-cli.ts` — `HARNESS_BIN` (`dist/bin/harness.js`), `HAS_HARNESS_BIN`,
  `runHarness(cwd, args, env?)`: win32-safe `spawnSync(process.execPath, [BIN, …])`
  (never the `.bin` shim), 60s timeout, returns `{ status, stdout, stderr }`.
- `temp-project.ts` — `scaffoldProject(files)` (real `mkdtemp` + write tree),
  `initGitRepo(dir)` (real `git init`/config/commit), `cleanup(dir)`.
- `fake-provider.ts` — `withFakeClaude(binDir, envelope, opts?)`: writes a fake
  `claude` executable on a PATH dir that emits a captured envelope; supports the
  `chattyOnce` mode (first call returns prose w/o `structured_output`, the #1558
  shape) driven by a counter file. `fakeProviderEnv(...)` steers the resolver
  onto the claude-CLI path (strips key/endpoint, prepends the fake bin dir).
- `tiers.ts` — unified gates: `HARNESS_E2E_LIVE`, `isTierBEnabled()`,
  `hasClaudeCli()`, `hasAnthropicKey()`, `POSIX`, and `skipTierB` /
  `skipUnlessBin` predicates for `describe.skipIf`.
- `fixtures.ts` — `loadClaudeEnvelope(name)`: reads
  `fixtures/claude-cli/<name>.json` from the repo root (resolved from the helper's
  own location, cwd-independent).
- `index.ts` — barrel re-export (the single import surface the docs reference).

**Acceptance:** helper is eslint-clean; consumed by Task 3; no cli src import.

## Task 2 — Captured-envelope fixture convention

Repo-root `fixtures/claude-cli/` (the ADR-named home for captured tool outputs):

- `structured-output.json` — a schema-conforming `structured_output` envelope.
- `chatty-narration.json` — the #1558 bug: `result` prose ("I've already called
  the StructuredOutput tool…"), NO `structured_output`.
- `README.md` — the capture convention: what an envelope is, how to record a real
  one, and that Tier A replays these while Tier B detects their drift.

**Acceptance:** both envelopes load via `loadClaudeEnvelope`; README documents the
convention.

## Task 3 — Canonical exemplars on the helpers

- `packages/cli/tests/e2e/cli-smoke.e2e.test.ts` — **Tier C**: `runHarness` a real
  `harness comprehend --all --static` on a scaffolded temp git repo; assert exit 0
  - the compiled unit on disk + a token-free `--check` staying fresh. All OSes.
- `packages/cli/tests/e2e/comprehend-boundary.e2e.test.ts` — **Tier A**
  (POSIX-gated, mirrors the flagship): `withFakeClaude(loadClaudeEnvelope(
'chatty-narration'), { chattyOnce })` → the corrective retry recovers → the unit
  lands `semantic: present`. Plus a **Tier B** gated-live `describe.skipIf(
skipTierB)` stub asserting the degradation-safe invariant, so the gate is real.

**Acceptance:** green under the cli package vitest on ubuntu/windows/macos in CI.

## Task 4 — "How to add an E2E test" doc

`docs/guides/e2e-testing.md`: the tier taxonomy, the `*.e2e.test.ts` naming +
co-location convention, the helper API (with the exemplars as copy-paste
templates), the fixture convention, and the tier gates. Link it from
`CONTRIBUTING.md`'s Testing section.

**Acceptance:** doc exists, links resolve, CONTRIBUTING points to it.

## Task 5 — Nightly Tier B lane + scripts

- Root scripts: `test:e2e` (Tier A/C, the per-PR subset) and `test:e2e:live`
  (`HARNESS_E2E_LIVE=1`, Tier B).
- `.github/workflows/main-health.yml`: add a SEPARATE `e2e-nightly` job (leaving
  the dependency-free watcher job untouched), gated to `schedule` /
  `workflow_dispatch` only (never per-CI-completion). It builds, asserts Tier B
  **gate reachability** (per ADR: a silently-skipped suite must not read as a
  pass), then runs the live suite best-effort with any provider creds from
  secrets.

**Acceptance:** job is nightly-only, degrades to a no-op without creds, and the
gate-reachability assertion fails loudly if the Tier B wiring rots.

## Task 6 — Governance artifacts

- Empty changeset (no publishable src changed — tests/fixtures/docs/workflow only).
- `provenance.json` (issue 1691, route feature, stages, assumptions incl. the
  scope decision + ADR 0111).

## Verification

- `pnpm --filter @harness-engineering/cli test` green locally (Node 22).
- Push; confirm all-OS CI green before declaring merge-ready.
- `Refs #1691` (first slice); remaining per-flow work named in the proposal.
