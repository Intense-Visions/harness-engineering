---
feature: skill-provider-freshness
status: proposed
keywords: [skill-install, skill-provider, freshness, lockfile-provenance, update-nudge, generate-slash-commands, supply-chain-consent]
strategy_track: external-adoption-flywheel
---

# External Skill-Provider Freshness & Install Follow-Through

## Overview & Goals

External skill providers (e.g. `harness install skills --from github:Intense-Visions/harness-iv --global`)
are installed once and then go stale silently: the CLI keeps no record of where a
GitHub-sourced skill came from, so it can never learn the upstream repository changed.
Separately, a successful install only *prints* a follow-up command
(`Run \`harness generate-slash-commands\`…`) instead of offering to run it.

This change closes both gaps for the external-skill-provider lifecycle.

**Goals**

1. Record enough provenance at install time to later detect that a provider's upstream source changed.
2. Passively **nudge** (never auto-apply) when a GitHub or npm skill provider has upstream changes,
   mirroring the CLI's own update-notification UX.
3. Provide `harness skill update [--check]` as the explicit, consent-gated remediation the nudge points at.
4. After a successful `harness install`, **ask and run** `generate-slash-commands` for the user
   instead of only printing the hint — without hanging non-interactive installs.

**Non-goals (YAGNI)**

- Auto-applying upstream skill changes without consent — deferred as a future config-gated opt-in.
- Freshness for local `--from` installs — recorded, but there is no meaningful upstream to probe.
- Pre-release / semver-range resolution beyond what `registry/resolver.ts` already does.

**Strategy grounding.** Advances the **External adoption flywheel** track in `STRATEGY.md`
("skill marketplace, constraint sharing bundles… make the harness valuable enough off-repo"):
keeping third-party skill providers fresh is core to that bet.

## Decisions Made

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Passive nudge **+** on-demand `harness skill update`; **no auto-apply** in v1 | Honors the user's "or at least prompt"; keeps unvetted third-party code from executing without an explicit human "yes". |
| D2 | Cover **GitHub + npm**; **record-but-skip local** | GitHub is the literal ask; npm `@harness-skills/*` is the other real provider channel; local `--from` has no meaningful upstream. |
| D3 | Post-install **ask-and-run** `generate-slash-commands`, default `Y`, TTY-gated, with `--generate` / `--no-generate` overrides | Honors "ask and run" without hanging the non-interactive/CI installs the command already supports. |
| D4 | Extend `LockfileEntry` with a `source` field (original spec + resolved commit/version); bump lockfile to **v2** | GitHub installs currently discard their source (`packages/cli/src/commands/install.ts:209` records `local:<tempdir>`); nothing can be diffed against upstream without this. |
| D5 | New `packages/cli/src/registry/freshness-checker.ts` mirroring the **structure** of `packages/core/src/update-checker.ts`; own `~/.harness/skill-freshness.json`; respects `HARNESS_NO_UPDATE_CHECK` | Clean separation from the CLI-version hot path; reuses a pattern the team already trusts. Located in the CLI (not core) because lockfile reading is a CLI-domain concern. |
| D6 | `harness skill update` **confirms per-provider** (`oldSHA → newSHA`) before pulling | Supply-chain safety — the confirm *is* the consent to execute upstream code (enforces D1). |

## Technical Design

### 1. Lockfile schema v2 — `packages/cli/src/registry/lockfile.ts`

```ts
export type SkillSource =
  | { kind: 'github'; owner: string; repo: string; ref: string; commit: string }
  | { kind: 'npm'; package: string; registry?: string }
  | { kind: 'local'; path: string };

export interface LockfileEntry {
  version: string;
  resolved: string;
  integrity: string;
  platforms: string[];
  installedAt: string;
  dependencyOf: string | null;
  source?: SkillSource; // NEW — absent on legacy v1 entries
}
```

`readLockfile` relaxes its hard `version === 1` guard to accept **1 or 2**. A v1 file loads
with every entry's `source` undefined (freshness-ineligible). `writeLockfile` always emits **v2**.
Deterministic `sortedStringify` already handles the nested `source` object. No destructive rewrite.

### 2. Capture provenance at install — `packages/cli/src/commands/install.ts`

- `cloneGitHubRepo` also runs `git rev-parse HEAD` in the clone dir and returns the resolved SHA.
- The GitHub ref + commit thread down through `runGitHubInstall → runBulkInstall → runLocalInstall
  → installSkillDir` via a new optional `source` parameter, so GitHub-sourced entries record
  `{ kind: 'github', owner, repo, ref, commit }` instead of `local:<tempdir>`.
- The npm path in `runInstall` records `{ kind: 'npm', package: packageName, registry? }`.
- Local `--from` entries record `{ kind: 'local', path }` (recorded, not probed).

### 3. Freshness checker — `packages/cli/src/registry/freshness-checker.ts`

Mirrors the shape of `core/update-checker.ts`:

- `readFreshnessState()` / `writeFreshnessState()` → `~/.harness/skill-freshness.json`.
- `shouldRunCheck(state, intervalMs)` and `isUpdateCheckEnabled()` reused/re-expressed; honors
  `HARNESS_NO_UPDATE_CHECK=1` and the configured interval.
- `spawnBackgroundFreshnessCheck(lockfilePaths)` — detached, `unref()`-ed process that reads the
  lockfile(s), and per eligible `source`:
  - **github** → `git ls-remote <https-url> <ref>` → upstream SHA; `outdated = sha !== source.commit`.
  - **npm** → `npm view <pkg> version` (honoring a custom registry) → `outdated = latest !== version`.
  Writes `{ lastCheckTime, providers: [{ name, kind, current, latest, outdated }] }` atomically
  (tmp-file + rename, as update-checker does).
- `getFreshnessNotification()` → `"N skill provider(s) have updates — run \`harness skill update\`"`
  or `null`.

### 4. Wiring — `packages/cli/src/bin/harness.ts`

Alongside the existing update-check invocation: resolve the global + project community lockfile
paths, spawn the background freshness check, and append `getFreshnessNotification()` to the existing
notification surface. Both checks share the same enable/interval gating.

### 5. Remediation command — `packages/cli/src/commands/skill/update.ts`

Registered in `packages/cli/src/commands/skill/index.ts`.

```
harness skill update [name] [--check] [--global] [--yes]
```

- Reads the relevant lockfile(s), probes eligible providers, prints a per-provider `old → new` table.
- `--check` → report-only; **non-zero exit** if any provider is outdated, zero otherwise.
- Default (no `--check`) → for each outdated provider, confirm (`proceed? (y/N)`) unless `--yes`,
  then re-invoke the existing `runInstall` / `runGitHubInstall` against the recorded `source`
  (`--force`) and update the lockfile's `commit`/`version`.
- Legacy v1 / sourceless entries report `"source unknown — reinstall to enable freshness"` and are
  skipped, never crash.

### 6. Install ask-and-run — `packages/cli/src/commands/install.ts` action + shared prompt util

- Extract the private `prompt()` from `commands/update.ts` into `packages/cli/src/output/prompt.ts`;
  both callers reuse it.
- Replace the printed hint (`install.ts:437-443`) with `offerGenerateSlashCommands(opts)`:
  - `process.stdout.isTTY` **and not** `--no-generate` → prompt `Generate slash commands now? (Y/n)`
    (default `Y`) → `execFileSync('harness', ['generate-slash-commands', ...scopeFlags], { stdio: 'inherit' })`,
    passing through the correct `--global --include-global` scope.
  - non-TTY → print today's hint (unchanged behavior).
  - `--generate` → run without prompting; `--no-generate` → suppress entirely.

## Integration Points

**Entry Points**
- New `harness skill update` subcommand.
- `harness install` gains `--generate` / `--no-generate` flags and post-install ask-and-run.
- New background freshness check + notification line in `bin/harness.ts`.

**Registrations Required**
- Register `skill update` in `packages/cli/src/commands/skill/index.ts`.
- Wire `spawnBackgroundFreshnessCheck` + `getFreshnessNotification` into `bin/harness.ts`.
- Regenerate generated CLI command docs if applicable.

**Documentation Updates**
- New `docs/knowledge/cli/skill-freshness.md` (freshness-check contract + source provenance).
- AGENTS.md CLI command list; install/update guide; CHANGELOG.

**Architectural Decisions**
- One ADR — *"External skill-provider freshness & consent model"* — covering **D1** (nudge-not-auto-apply
  consent posture) and **D4** (lockfile v2 + source provenance). Both set durable contracts (on-disk
  format + supply-chain consent) that outlive this change; **D6** is the mechanical enforcement of D1.
  Warrants a standalone ADR because the lockfile format and the "never execute unvetted upstream code
  without explicit consent" posture are cross-cutting commitments future skill-distribution work must honor.

**Knowledge Impact**
- New concepts: *skill-source provenance* and *freshness-check contract*.
- Relationship to the existing update-checker pattern and a `distinct-axis` note against
  `docs/knowledge/cli/skill-provenance.md` (authorship channel, not source freshness).

## Success Criteria

1. Installing from `github:owner/repo#ref` records `source.kind=github` with owner/repo/ref and the
   resolved commit SHA in the lockfile entry.
2. Installing from npm records `source.kind=npm` with the package name (and custom registry if set).
3. When a recorded GitHub provider's upstream ref SHA differs from the recorded commit, the next CLI
   invocation prints a nudge naming the count and pointing to `harness skill update`.
4. `harness skill update --check` exits non-zero iff ≥1 provider is outdated, printing per-provider
   `old → new`.
5. `harness skill update` confirms per provider (unless `--yes`) before re-pulling and updates the
   lockfile commit/version on success.
6. After a successful **interactive** `harness install`, the CLI prompts and runs
   `generate-slash-commands` on assent; **non-TTY** falls back to printing the hint; `--no-generate`
   suppresses; `--generate` runs without prompting.
7. All background/network freshness behavior is suppressed when `HARNESS_NO_UPDATE_CHECK=1`.
8. A v1 lockfile loads without error; sourceless entries are reported
   "source unknown — reinstall to enable freshness," never crashing.

## Implementation Order

### Phase 1: Install Ask-And-Run

<!-- complexity: low -->

Request B, small and independent. Extract the private `prompt()` from `commands/update.ts` into a
shared `output/prompt.ts`; add `offerGenerateSlashCommands()` to the install action with TTY gating
and `--generate` / `--no-generate` flags. Unit tests for TTY/non-TTY/flag branches.

### Phase 2: Lockfile Provenance Foundation

<!-- complexity: medium -->

Extend `LockfileEntry` with `SkillSource`; bump lockfile to v2 with a v1-accepting reader. Capture the
GitHub commit SHA in `cloneGitHubRepo` and thread `source` through
`runGitHubInstall → runBulkInstall → runLocalInstall → installSkillDir`; record npm and local sources.
Unit tests for the v1→v2 read migration and each source kind.

### Phase 3: Freshness Checker

<!-- complexity: medium -->

Add `packages/cli/src/registry/freshness-checker.ts` (github `git ls-remote` + npm `npm view` probes,
cached `~/.harness/skill-freshness.json`, `getFreshnessNotification()`), mirroring the structure of
`core/update-checker.ts`. Wire the background spawn + notification into `bin/harness.ts`. Honors
`HARNESS_NO_UPDATE_CHECK`. Unit tests for probe comparison and notification formatting.

### Phase 4: Skill Update Command

<!-- complexity: medium -->

Add `packages/cli/src/commands/skill/update.ts` (`[name] [--check] [--global] [--yes]`) and register it
in `commands/skill/index.ts`. Report-only `--check` with non-zero exit on drift; default per-provider
confirm then re-pull via the existing install paths; sourceless entries reported, never crash. Tests.

### Phase 5: Documentation And ADR

<!-- complexity: low -->

Write `docs/knowledge/cli/skill-freshness.md`, the ADR *"External skill-provider freshness & consent
model"*, AGENTS.md command-list entry, and CHANGELOG. Update the install/update guide.
