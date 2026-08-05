# Plan: External Skill-Provider Freshness — Phase 5 (Documentation & ADR)

**Date:** 2026-08-05 | **Spec:** `docs/changes/skill-provider-freshness/proposal.md` (§"Phase 5") | **Tasks:** 6 | **Time:** ~26 min | **Integration Tier:** large

## Goal

Document the already-shipped external skill-provider freshness & consent model (Phases 1–4) so its on-disk format and supply-chain posture are durable, discoverable knowledge — a knowledge doc, a standalone ADR, an AGENTS.md command-list entry, a CHANGELOG entry, and a skill-marketplace guide update. **Docs-only: no source or behavior changes.**

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/cli/skill-freshness.md` exists and documents: the freshness-check contract; `SkillSource` provenance recorded at install (github `owner/repo/ref/commit`; npm `package` + optional `registry`; local `path`); the detached background probe (`~/.harness/skill-freshness.json`, `HARNESS_NO_UPDATE_CHECK` kill-switch + shared interval, the one-line nudge); the on-demand `harness skill update [name] [--check] [--global] [--yes]` command and the `harness update` (D7) integration; the supply-chain **consent** posture (nudge-not-auto-apply; per-provider default-`N` confirm); the injection/DoS hardening (`execFileSync` argument arrays, leading-dash + `owner/repo`/`ref` separator guards, `MAX_PROVIDERS`/`PROBE_BUDGET_MS`); lockfile v2 migration (v1 loads; sourceless entries report "reinstall to enable freshness"); and an explicit **distinct-axis** note versus `skill-provenance.md` (authorship channel vs source freshness).
2. `docs/knowledge/decisions/0083-external-skill-provider-freshness-and-consent-model.md` exists in the repo ADR format (frontmatter `number/title/date/status/tier/source`; Context/Decision/Consequences), capturing **D1** (passive nudge + on-demand, NO auto-apply), **D4** (lockfile v2 + source provenance), **D6/D7** (per-provider consent; `harness update` integration), and explicitly recording the **accepted residual risk**: a custom npm registry in a community lockfile is an attacker-reachable outbound host on probe (mitigated by timeout + kill-switch + caps; accepted because supporting custom registries requires it).
3. `AGENTS.md` Community Skill Registry section lists `harness skill update`, matching the surrounding entry style.
4. `CHANGELOG.md` `## [Unreleased] → ### Added` contains a user-facing entry that cites **no** internal roadmap/PR/issue numbers.
5. `docs/guides/skill-marketplace.md` documents the freshness nudge, `harness skill update`, the `harness update` integration, the install ask-and-run (`--generate`/`--no-generate`), and the lockfile v2 `source` field.
6. `harness validate` passes.
7. The generated `docs/reference/cli-commands.md` is **unchanged** (Phase 4 already regenerated it — line 1378 documents `harness skill update`); no prose added anywhere forces a regen.

## File Map

- CREATE `docs/knowledge/cli/skill-freshness.md`
- CREATE `docs/knowledge/decisions/0083-external-skill-provider-freshness-and-consent-model.md`
- MODIFY `AGENTS.md` (§"Community Skill Registry", ~line 862)
- MODIFY `CHANGELOG.md` (`## [Unreleased]` → `### Added`)
- MODIFY `docs/guides/skill-marketplace.md` (Lockfile section + new "Keeping providers fresh" section + install ask-and-run note)

## Uncertainties

- [ASSUMPTION] ADR number **0083** is next (verified free; highest existing is `0082`). If a parallel branch claims `0083` before merge, renumber to the next free slot and update the CHANGELOG/knowledge-doc links.
- [ASSUMPTION] The knowledge doc + ADR are internal repo docs; the repo ADR format does not use issue/PR references, so none are added. Only the CHANGELOG carries the explicit "no internal numbers" hygiene constraint.
- [DEFERRABLE] Exact CHANGELOG bullet wording (finalize during execution; content is fixed).

_No BLOCKING uncertainties._

## Rigor / Skeleton

Rigor: **standard**. Task count is 6 (< 8 threshold) → **no skeleton pass**; full tasks follow directly.

## Notes for the Executor (docs-only adaptation)

- This phase produces **no code**, so the TDD "write test → fail → implement" loop does not apply. The verification step for every task is `harness validate` (a docs-only phase's equivalent gate); Task 6 adds a doc-drift + no-regen sweep.
- All facts below were read from the shipped implementation (`packages/cli/src/registry/{lockfile.ts,freshness-checker.ts}`, `packages/cli/src/commands/skill/{update.ts,provider-update.ts}`, `packages/cli/src/commands/{install.ts,update.ts}`, `packages/cli/src/bin/freshness-check-hooks.ts`). Do not paraphrase away accuracy: the nudge string is exactly ``${n} skill ${noun} ${verb} updates — run `harness skill update` `` (noun `provider`/`providers`, verb `has`/`have`); `MAX_PROVIDERS = 100`; `PROBE_BUDGET_MS = 120_000`; per-probe `timeout: 15000`.
- Node 22 for any harness command: `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22`. Commit with `HUSKY=0 git commit`.
- Never `cd` to the main repo; operate only in this worktree.

---

## Tasks

### Task 1: Write the freshness knowledge doc

**Depends on:** none | **Files:** `docs/knowledge/cli/skill-freshness.md`

1. Create `docs/knowledge/cli/skill-freshness.md` with exactly this content:

````markdown
---
type: business_concept
domain: cli
tags: [skills, freshness, lockfile-provenance, supply-chain, update-nudge]
---

# Skill-Source Freshness

External skill providers — installed with `harness install <name> --from github:owner/repo`
or from the `@harness-skills/*` npm namespace — go stale silently: once copied
into `agents/skills/community/`, nothing records where they came from, so the CLI
can never learn the upstream source moved on. **Skill-source freshness** closes
that gap by recording provenance at install time and probing it later.

> **Distinct axis from [`skill-provenance.md`](./skill-provenance.md).** Provenance
> answers _who authored a skill_ (`user-authored` / `agent-proposed` / `community`),
> stored in `skill.yaml` and used for audit. Freshness answers _where the installed
> copy came from and whether upstream has changed_, stored in the community
> `skills-lock.json` `source` field. They are orthogonal: a `community`-authored skill
> and a `github`-sourced install are independent facts about the same skill.

## Source provenance (recorded at install)

Each community `skills-lock.json` entry carries an optional `source` (see
`packages/cli/src/registry/lockfile.ts`):

```ts
export type SkillSource =
  | { kind: 'github'; owner: string; repo: string; ref: string; commit: string }
  | { kind: 'npm'; package: string; registry?: string }
  | { kind: 'local'; path: string };
```

- **github** — records `owner`, `repo`, the requested `ref` (branch/tag, or `HEAD`),
  and the resolved `commit` SHA captured by `git rev-parse HEAD` in the clone. The
  commit is the freshness baseline.
- **npm** — records the `package` name and, when a private registry was used, the
  `registry` URL. The installed `version` is the freshness baseline.
- **local** — records the `path`. Recorded for completeness but **never probed**:
  a local directory has no meaningful upstream.

## Lockfile v2 migration

The community lockfile bumps to **version 2**. `readLockfile` accepts version **1 or 2**;
`writeLockfile` always emits v2, so a read-then-write upgrades a v1 file in place with no
destructive rewrite (deterministic sorted-key serialization handles the nested `source`).
A v1 entry loads with `source` undefined and is **freshness-ineligible** — every freshness
surface reports it as `source unknown — reinstall to enable freshness` and skips it, never
crashing.

## The freshness-check contract

A provider is evaluated by `evaluateEntry` (`packages/cli/src/registry/freshness-checker.ts`):

| Source kind                   | `current` baseline | `latest` probe                                   | `outdated`                                   |
| ----------------------------- | ------------------ | ------------------------------------------------ | -------------------------------------------- |
| `github`                      | `source.commit`    | `git ls-remote <https-url> <ref>` → upstream SHA | `latest != null && latest !== source.commit` |
| `npm`                         | entry `version`    | `npm view <pkg> version` (honoring `registry`)   | `latest != null && latest !== version`       |
| `local` / no source / unknown | —                  | —                                                | skipped (never probed)                       |

A failed probe yields `latest === null`, which is **fail-safe**: `outdated` is `false`, so a
network blip or offline run never triggers a spurious re-pull nor masquerades as "up to date"
(the on-demand table renders it as `(could not check)`).

## Background check (passive nudge)

At CLI startup, `runFreshnessCheckAtStartup()` (`bin/freshness-check-hooks.ts`) — gated by the
**same** enable/interval switches as the CLI's own version update check (`isUpdateCheckEnabled`,
`shouldRunFreshnessCheck`, the configured interval) — spawns a **detached, `unref()`-ed** Node
probe over the existing global + project community lockfiles. The probe:

- writes its result atomically (tmp-file + rename) to `~/.harness/skill-freshness.json`;
- is fully self-contained (`buildProbeScript`) and swallows every error, so the user never sees
  a probe failure;
- uses `execFileSync` with **argument arrays** (no shell) so lockfile-sourced strings are never
  shell-interpolated.

After the command runs, `printFreshnessNotification()` appends a one-line nudge to stderr when
any provider is outdated:

```
2 skill providers have updates — run `harness skill update`
```

(`1 skill provider has updates …` in the singular.) When `HARNESS_NO_UPDATE_CHECK=1` (or a zero
interval) the entire background + notification path is suppressed.

## On-demand remediation — `harness skill update`

```
harness skill update [name] [--check] [--global] [--yes]
```

- Probes eligible providers synchronously (`probeProviders`) and prints a per-provider table:
  `current -> latest` (outdated), `current (up to date)`, or `current (could not check)`.
- `--check` → report-only; **exits non-zero** iff ≥1 provider is outdated.
- Default → for each outdated provider, confirm `Update <name> (old -> new) — proceed? (y/N)`
  (**default N**) unless `--yes`, then re-pull from the recorded `source` via the existing
  install path (`--force`) and rewrite the lockfile `commit`/`version`.
- `--global` probes the global lockfile only; otherwise project + global.
- Sourceless (legacy v1) entries print `source unknown — reinstall to enable freshness` and are
  skipped, never crashing.

## `harness update` integration (D7)

`harness update` calls `offerSkillProviderUpdates()` in both its "already up to date" and
post-update branches (mirroring `offerIntegrationsSync` / `offerRegeneration`). It gates on
`isFreshnessCheckEnabled` first; on a non-TTY it prints only a static report-only hint; on a TTY
it probes, prints the outdated summary, and asks `Update skill providers now? (y/N)` (**default N**).
It is best-effort — a freshness error never aborts `update`.

## Supply-chain consent posture

The check **nudges but never auto-applies**. Pulling an outdated provider re-executes third-party
skill content, so the consent gate — a per-provider `(y/N)` confirm defaulting to **No** — _is_ the
authorization to run upstream code. Auto-apply is a deliberately deferred, future config-gated
opt-in. This posture is the durable contract; its mechanical enforcement lives in the confirm.

## Injection / DoS hardening

- **No shell.** Both the background probe and the on-demand path use `execFileSync` with argument
  arrays, so lockfile-sourced values are never interpolated into a shell.
- **Leading-dash guard.** Any `source` field beginning with `-` (which `git`/`npm` would parse as
  an option flag) causes the entry to be skipped.
- **Separator guards on re-pull.** `owner`/`repo` carrying `/` or `#`, or a `ref` carrying `#`,
  are rejected before reconstructing a `github:owner/repo#ref` spec, so a hostile lockfile cannot
  silently redirect a re-pull to a different repo. A slash-containing branch name (`feature/foo`)
  round-trips cleanly and is allowed.
- **Bounded work.** `MAX_PROVIDERS = 100` and `PROBE_BUDGET_MS = 120_000` cap how many providers
  and how long a single run probes (each probe also carries a 15s timeout), so a maliciously large
  lockfile cannot trigger an unbounded subprocess storm. Non-probeable entries do not count against
  the cap.

## Related

- [`skill-provenance.md`](./skill-provenance.md) — the authorship axis (distinct from this).
- ADR [0083 — External skill-provider freshness & consent model](../decisions/0083-external-skill-provider-freshness-and-consent-model.md).
- [Skill Marketplace Guide](../../guides/skill-marketplace.md) — user-facing usage.
````

2. Run: `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22; harness validate`
3. Commit: `HUSKY=0 git commit` — `docs(cli): add skill-source freshness knowledge doc`

---

### Task 2: Write ADR 0083

**Depends on:** Task 1 (cross-links the knowledge doc) | **Files:** `docs/knowledge/decisions/0083-external-skill-provider-freshness-and-consent-model.md` | **Category:** integration

1. Before writing, re-confirm the next number is free: `ls docs/knowledge/decisions/0083* 2>/dev/null` (expect no match). If taken, use the next free number and update all links.
2. Create `docs/knowledge/decisions/0083-external-skill-provider-freshness-and-consent-model.md` with exactly this content:

```markdown
---
number: 0083
title: External skill-provider freshness & consent model
date: 2026-08-05
status: accepted
tier: large
source: docs/changes/skill-provider-freshness/proposal.md
---

## Context

External skill providers installed via `harness install --from github:owner/repo` or the
`@harness-skills/*` npm namespace were fire-and-forget: the lockfile recorded only
`resolved: "local:<tempdir>"` for GitHub installs, discarding the upstream source, so the CLI
could never detect that a provider's upstream had changed. The external-adoption flywheel
(`STRATEGY.md`) depends on third-party skill providers staying fresh, which forces two durable,
cross-cutting commitments: an on-disk format that records enough provenance to diff against
upstream, and a supply-chain posture for _when_ unvetted upstream code is allowed to run. Both
outlive this change and must be honored by future skill-distribution work, which is why they are
captured here rather than left implicit in the code.

## Decision

**D1 — Passive nudge + on-demand, never auto-apply (v1).** The CLI records provenance and probes
upstream, but a detected update only produces a one-line nudge. Applying an update re-executes
third-party skill content; doing so silently would run unvetted code without a human "yes".
Auto-apply is deferred as a future, config-gated opt-in.

**D4 — Lockfile v2 + source provenance.** `LockfileEntry` gains an optional
`source: SkillSource` (`github {owner,repo,ref,commit}` | `npm {package,registry?}` |
`local {path}`) and the community lockfile bumps to **version 2**. The reader accepts v1 **or**
v2; the writer always emits v2, upgrading a v1 file in place on read-then-write with no
destructive rewrite. A v1 (sourceless) entry loads freshness-ineligible and is reported
"reinstall to enable freshness", never crashing. This on-disk format is a durable contract.

**D6 — Per-provider consent is the enforcement of D1.** `harness skill update` confirms each
outdated provider (`old -> new`, default **N**) before re-pulling. The confirm _is_ the consent
to execute upstream code — the mechanical teeth behind D1's posture.

**D7 — `harness update` surfaces freshness too.** `harness update` is where users refresh
everything harness-related, so it also probes providers and (on a TTY) offers the same
shared-core update, degrading to a report-only hint in non-TTY / `HARNESS_NO_UPDATE_CHECK=1` and
never aborting `update` on a freshness error.

Probing is hardened against hostile lockfiles: `execFileSync` argument arrays (no shell), a
leading-dash guard, `owner/repo`/`ref` separator guards on re-pull, and `MAX_PROVIDERS` /
`PROBE_BUDGET_MS` / per-probe-timeout caps.

## Consequences

- **Positive.** Providers can be kept current with explicit consent; the recorded `source` gives
  future skill-distribution work a stable base to diff and re-pull against; freshness reuses the
  trusted `update-checker` gating (`HARNESS_NO_UPDATE_CHECK` + interval), so one switch silences
  all background network probes.
- **Neutral.** The lockfile format is now versioned (v1 ⇄ v2); consumers reading it directly must
  tolerate both. Auto-apply remains unbuilt by design.
- **Negative (accepted residual risk).** A custom **npm registry URL** recorded in a _community_
  lockfile becomes an attacker-reachable outbound host during probing: `npm view <pkg> --registry
<url>` contacts whatever registry the entry names, so an actor who can plant a lockfile entry
  can cause a victim's machine to make an outbound request to a host of their choosing on the next
  CLI invocation. This is **accepted** because supporting custom/private registries is a
  first-class, documented install feature that inherently requires probing them. It is mitigated,
  not eliminated: the 15s per-probe timeout, the `MAX_PROVIDERS` / `PROBE_BUDGET_MS` caps, the
  leading-dash guard (no smuggled flags), and the `HARNESS_NO_UPDATE_CHECK` kill-switch bound the
  blast radius to a timeout-limited outbound GET that any user can disable.

See [`docs/knowledge/cli/skill-freshness.md`](../cli/skill-freshness.md) for the full contract and
[`docs/knowledge/cli/skill-provenance.md`](../cli/skill-provenance.md) for the distinct authorship
axis.
```

3. Run: `harness validate`
4. Commit: `HUSKY=0 git commit` — `docs(adr): 0083 external skill-provider freshness & consent model`

---

### Task 3: Add `harness skill update` to AGENTS.md command list

**Depends on:** Task 1 | **Files:** `AGENTS.md` | **Category:** integration

1. In the `### Community Skill Registry` section (~line 862), replace the "Key commands" sentence and its trailing prose. Find:

   ```
   The `@harness-skills/*` npm namespace enables publishing, discovering, and installing community skills. Key commands: `harness install`, `harness uninstall`, `harness skill search`, `harness skill create`, `harness skill publish`. Supports local installs (`--from ./path`), private registries (`--registry <url>`), and `.npmrc` auth tokens. Skills are pure content packages (no runtime code). Discovery priority: project-local > community > bundled.
   ```

   Replace with:

   ```
   The `@harness-skills/*` npm namespace enables publishing, discovering, and installing community skills. Key commands: `harness install`, `harness uninstall`, `harness skill search`, `harness skill create`, `harness skill publish`, `harness skill update`. Supports local installs (`--from ./path`), private registries (`--registry <url>`), and `.npmrc` auth tokens. Skills are pure content packages (no runtime code). Discovery priority: project-local > community > bundled. GitHub- and npm-sourced providers record source provenance in the lockfile; a passive background check nudges (never auto-applies) when an upstream provider changes, and `harness skill update [--check]` applies the refresh under per-provider consent. See [`docs/knowledge/cli/skill-freshness.md`](./docs/knowledge/cli/skill-freshness.md).
   ```

2. Run: `harness validate`
3. Commit: `HUSKY=0 git commit` — `docs(agents): list harness skill update in community skill registry`

---

### Task 4: Update the skill-marketplace guide

**Depends on:** Task 1 | **Files:** `docs/guides/skill-marketplace.md` | **Category:** integration

1. In the **Lockfile** section, replace the JSON example (currently `"version": 1` with no `source` and the trailing paragraph). Find the fenced block that begins `{\n  "version": 1,` and the sentence "The lockfile is deterministic (sorted keys) so it produces clean git diffs. You can commit it for reproducibility or `.gitignore` it." Replace the JSON with:

   ````
   ```json
   {
     "version": 2,
     "skills": {
       "@harness-skills/deployment": {
         "version": "1.2.0",
         "resolved": "https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.2.0.tgz",
         "integrity": "sha512-...",
         "platforms": ["claude-code", "gemini-cli"],
         "installedAt": "2026-03-25T10:00:00Z",
         "dependencyOf": null,
         "source": { "kind": "npm", "package": "@harness-skills/deployment" }
       }
     }
   }
   ```
   ````

   And append, after the "deterministic (sorted keys)" sentence:

   ```
   The lockfile is at **version 2**: each entry may carry a `source` describing where it came from
   (`github` with `owner/repo/ref/commit`, `npm` with `package` and optional `registry`, or
   `local` with a `path`). This provenance is what powers freshness checks. A version-1 lockfile
   still loads; its entries have no `source` and are reported "source unknown — reinstall to enable
   freshness" until reinstalled.
   ```

2. Add a new top-level section immediately **before** the `## Architecture` section:

   ````
   ## Keeping providers fresh

   GitHub- and npm-sourced providers record where they came from, so harness can tell when an
   upstream provider has moved on. (Local `--from` installs are recorded but never probed — there is
   no meaningful upstream.)

   ### The passive nudge

   On CLI startup — gated by the same switches as the CLI's own update check and silenced by
   `HARNESS_NO_UPDATE_CHECK=1` — a detached background probe checks each recorded provider and caches
   the result in `~/.harness/skill-freshness.json`. When something is outdated you'll see a one-line
   nudge:

   ```
   2 skill providers have updates — run `harness skill update`
   ```

   The nudge never pulls anything on its own.

   ### Applying updates

   ```bash
   # Report only — exits non-zero if any provider is outdated
   harness skill update --check

   # Refresh outdated providers, confirming each (old -> new) — default is No
   harness skill update

   # Only the global (~/.harness) lockfile; skip per-provider prompts
   harness skill update --global --yes

   # A single provider by name
   harness skill update deployment
   ```

   Each outdated provider is re-pulled from its recorded source (`--force`) and its lockfile
   `commit`/`version` is rewritten. Confirmation defaults to **No**: because a re-pull re-executes
   third-party skill content, the confirm is your consent to run upstream code. `harness update`
   surfaces the same outdated-provider summary and (on a TTY) offers to refresh them.

   ### Install follow-through

   After a successful install on a TTY, `harness install` now asks — defaulting to **Yes** — to run
   `generate-slash-commands` for you instead of only printing the hint. Use `--generate` to run it
   without prompting or `--no-generate` to suppress it; non-interactive installs still just print the
   hint.

   See [`docs/knowledge/cli/skill-freshness.md`](../knowledge/cli/skill-freshness.md) for the full
   freshness contract and hardening details.

   ````

3. In the **Architecture** file-tree, add these two lines so the tree reflects the new modules (insert under `skill/` and `registry/` respectively):
   - Under the `skill/` block add: `│       ├── update.ts             — harness skill update <name> (freshness + re-pull)`
   - Under the `registry/` block add: `│   ├── freshness-checker.ts     — background probe + freshness nudge`

4. Run: `harness validate`
5. Commit: `HUSKY=0 git commit` — `docs(guide): document skill-provider freshness in marketplace guide`

---

### Task 5: Add the CHANGELOG entry

**Depends on:** Task 1, Task 2 | **Files:** `CHANGELOG.md` | **Category:** integration

1. Under `## [Unreleased]` → `### Added`, insert this bullet as the **first** item in the list. **Cite no internal roadmap/PR/issue numbers** — links to the guide/knowledge-doc/ADR paths are allowed:

   ```
   - **External skill-provider freshness & install follow-through** — GitHub- and npm-sourced skill providers now record where they came from (`owner/repo/ref/commit` for GitHub, package + optional registry for npm) in the community lockfile, so the CLI can tell when an upstream provider has moved on. A passive background check — sharing the CLI's own update-check switches and silenced by `HARNESS_NO_UPDATE_CHECK` — prints a one-line nudge when a provider is outdated; it never pulls anything on its own. The new `harness skill update [name] [--check] [--global] [--yes]` command reports each provider's `current → latest` and, with explicit per-provider confirmation (default No), re-pulls outdated providers from their recorded source; `--check` is report-only and exits non-zero when anything is stale. `harness update` surfaces the same outdated-provider summary and offers to refresh. `harness install` now asks (on a TTY, default Yes) to run `generate-slash-commands` for you instead of only printing the hint, with `--generate` / `--no-generate` overrides. The lockfile bumps to **v2** (v1 files still load; entries installed before this change report "source unknown — reinstall to enable freshness"). See the [Skill Marketplace Guide](docs/guides/skill-marketplace.md), [`docs/knowledge/cli/skill-freshness.md`](docs/knowledge/cli/skill-freshness.md), and [ADR 0083](docs/knowledge/decisions/0083-external-skill-provider-freshness-and-consent-model.md). (`@harness-engineering/cli`)
   ```

2. Run: `harness validate`
3. Commit: `HUSKY=0 git commit` — `docs(changelog): add external skill-provider freshness entry`

---

### Task 6: Final docs sweep — validate, no-regen, doc-drift `[checkpoint:human-verify]`

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5 | **Files:** (verification only) | **Category:** integration

1. Confirm the generated CLI reference was **not** touched and needs no regen:
   `git status --short docs/reference/cli-commands.md` → expect **empty** (Phase 4 already documented `harness skill update` at `cli-commands.md:1378`).
2. Run doc-drift detection over the changed docs (best-effort; if the command is unavailable, skip): `harness detect-doc-drift` — expect no new drift attributable to these files.
3. Run: `harness validate` → expect `validation passed`.
4. `[checkpoint:human-verify]` — Show the human: the two new files (`skill-freshness.md`, ADR 0083), the AGENTS.md / CHANGELOG / guide diffs, and confirmation that `cli-commands.md` is unchanged. Wait for confirmation that the docs read accurately and hygiene holds (no internal roadmap/PR/issue numbers in the CHANGELOG).
5. No commit (verification only; all content already committed per prior tasks).

---

## Sequencing & Parallelism

- **Task 1** is the root (the knowledge doc other artifacts link to).
- **Tasks 2, 3, 4** depend only on Task 1 and touch disjoint files (`decisions/…`, `AGENTS.md`, `skill-marketplace.md`) — they may run in parallel after Task 1.
- **Task 5** depends on Tasks 1 and 2 (it links both).
- **Task 6** is the terminal verification gate; depends on all.

## Integration Points → Tasks (from spec §"Integration Points")

- **Documentation Updates:** knowledge doc → Task 1; AGENTS.md → Task 3; install/update guide → Task 4; CHANGELOG → Task 5.
- **Architectural Decisions:** the one ADR → Task 2.
- **Knowledge Impact:** the _skill-source provenance_ + _freshness-check contract_ concepts and the distinct-axis note → Task 1 (+ Task 2 consequences).
- **Registrations Required / Entry Points:** already landed in Phases 1–4; the generated `cli-commands.md` was regenerated there (Task 6 verifies no further regen).

```

```
