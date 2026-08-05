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
skill content, so the consent gate — a `(y/N)` confirm defaulting to **No** — _is_ the
authorization to run upstream code. `harness skill update` confirms **per-provider** (default N),
whereas the `harness update` D7 integration authorizes the whole outdated batch with a **single
aggregate** confirm (default N) then applies all; both gate before any upstream code runs. Auto-apply
is a deliberately deferred, future config-gated opt-in. This posture is the durable contract; its
mechanical enforcement lives in the confirm.

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
