# Refuse to scan when the CLI is sharply out of step with the workspace it is scanning

**Keywords:** toolchain-pin, version-guard, semver, stale-scanner, phantom-findings, preAction-hook, harness-config, runtime-precondition

## Overview

A scanner that predates the rules it is evaluating does not fail — it produces
confident, well-formatted, wrong output. That output is indistinguishable from a
real result, and everything downstream treats it as evidence.

This is not hypothetical. Measured live on this machine:

```
$ ~/.nvm/versions/node/v22.20.0/bin/harness --version
1.13.1
$ /opt/homebrew/bin/harness --version
11.1.1
```

`~/.nvm/versions/node/v22.20.0/bin/harness` is a symlink (dated Mar 27) into
`../lib/node_modules/@harness-engineering/cli/dist/bin/harness.js`. The
Node-22 bin directory is not just an interpreter directory — it carries its own
`harness` and `harness-mcp` shims. Anything that prepends that directory to
`PATH` in order to get Node 22 silently also acquires a ten-major-versions-stale
`harness`.

That is exactly what happened in the run that produced this work item. A fleet
conductor, correctly obeying a documented "use Node 22 for this repo"
precondition, prepended the Node-22 bin directory to `PATH` for every probe and
every lane. Every one of them then ran a v1.13.1 scanner against a v11 workspace.
v1.13.1 predates the prior-line `harness-ignore` suppression pass, so it
re-reported every already-justified suppression as a live finding. The
consequences were not cosmetic:

- 33 of the security probe's 36 code-side findings were phantoms.
- The sole ERROR escalated to a human decision gate — `dangerouslySetInnerHTML`
  at `packages/core/src/review/finding-integrity.ts:94` — **does not exist**.
  That line is the XSS _detection vocabulary registry_, annotated
  `harness-ignore SEC-XSS-002: definitional`.
- A queue depth of 41 that drove a scheduling decision was roughly 90% noise.

Three properties of this failure are worth naming, because they determine the
shape of the fix:

1. **It is silent.** No error, no warning, no exit code. The only signal was a
   version string nobody thought to read.
2. **It is high-leverage.** One environment assumption, injected once, corrupted
   every downstream consumer simultaneously.
3. **The victims were all doing the right thing.** The precondition was real, the
   directory was correct for its stated purpose, and the failure came from a
   side effect of _how_ it was applied.

Point 3 is why the durable fix cannot be "be more careful with `PATH`."
Prescribing careful `PATH` handling asks every future caller to get an invisible
detail right forever. The load-bearing fix is to make the CLI itself refuse to
emit findings when it is sharply out of step with the workspace it is pointed
at — so that when the careful handling is eventually gotten wrong (and it will
be), the result is a loud refusal rather than 33 phantoms.

This proposal addresses **§5 of the source report only**. The report carries 31
other findings; they are routed separately and are explicitly out of scope here.

## Problem boundary

**In scope**

- A mechanism inside the CLI that detects a sharp version mismatch between the
  running binary and the workspace it is scanning, and refuses to produce
  findings when the gap is large.
- A declarative way for a workspace to state which CLI major line it expects.
- Documenting the Node-22 runtime precondition — and the `PATH`-shadowing trap
  that the naive reading of it creates — in the `-fleet` family reference, which
  today says nothing about runtime environment at all.

**Out of scope**

- The other 31 findings in the source report (probe-depth fidelity, the
  structural shed, gate batching, enforcement seams, the separable defects).
- Changing how any fleet skill actually spawns processes. No fleet `SKILL.md`
  body is modified by this change; the family reference is the single documented
  home for the family-wide precondition.
- Pinning or validating the Node interpreter version beyond what
  `packages/cli/src/utils/node-version.ts` already does.
- Any auto-remediation (auto-upgrading, re-execing the correct binary). The
  guard reports and refuses; it never rewrites the caller's environment.
- **The MCP surface.** The guard is a commander `preAction` hook, so it covers
  CLI invocations only. The MCP tools call the check implementations in-process
  and do not pass through commander, so a stale `harness-mcp` shim — and the
  Node-22 bin directory carries one alongside `harness` — reproduces this
  incident with no mitigation from this change. That is a real remaining gap, and
  arguably the more likely path for an agent-driven conductor. Gating the
  findings-producing MCP tool handlers with the same evaluator is the natural
  follow-up; it is named here so the gap is explicit rather than implied to be
  covered.

## Prior art in this codebase

The pieces this builds on already exist; nothing here is a new pattern.

- `packages/cli/src/utils/node-version.ts` — `REQUIRED_NODE_VERSION = '>=22.0.0'`
  and `checkNodeVersion()` via `semver.satisfies(process.version, ...)`. This is
  the established "your toolchain is wrong" shape, and the new guard is a direct
  sibling of it. It is consumed by `commands/doctor.ts:676` and
  `commands/setup.ts:224` — i.e. it _reports_, it does not gate.
- `packages/cli/src/commands/install-constraints.ts:80-88` — already does a
  `semver.lt(CLI_VERSION, bundle.minHarnessVersion)` refusal against a
  `minHarnessVersion` declared on a constraint bundle
  (`packages/core/src/constraints/sharing/types.ts:10`). The concept of "this
  artifact declares the CLI version it needs" is therefore already established;
  this proposal extends it from constraint bundles to the workspace itself.
- `packages/cli/src/version.ts` — `CLI_VERSION`, read from the CLI's own
  `package.json` via `createRequire`, falling back to `'0.0.0'`.
- `packages/cli/src/bin/command-telemetry.ts:45-72` — the only existing
  _root-level_ `program.hook('preAction', ...)`. It proves a root hook fires for
  every subcommand and shows the `resolveCommandName(actionCommand)` idiom for
  recovering the dotted command name (`graph.scan`). The guard reuses both.
- `packages/core/src/update-checker.ts:33-37` — `HARNESS_NO_UPDATE_CHECK === '1'`
  is the established env-var opt-out convention (`HARNESS_*`, compared against
  the string `'1'`).
- `semver` is already a direct dependency of `packages/cli` (`^7.7.4`, with
  `@types/semver`). It is **not** a dependency of `packages/core`, which is one
  reason the guard is placed in `cli`.

Nothing anywhere currently reads the consuming project's expected harness
version. `HarnessConfigSchema` (`packages/cli/src/config/schema.ts:924`) has a
top-level `version: z.literal(1)`, but that is the _config schema_ version, not a
toolchain pin. There is no existing symbol named `versionMismatch`,
`majorVersion`, or `checkVersion` in the repo.

## Decisions made

Per the `-fleet` family's autonomous-default interaction model, each decision
below was taken on its recommended default and is recorded here with the
tradeoff that was weighed, rather than deferred to an interactive round.

### D1 — Where does the "expected version" come from?

|            | A) Project `package.json` dep only | B) New `harness.config.json` field only | C) Config field, falling back to the dep |
| ---------- | ---------------------------------- | --------------------------------------- | ---------------------------------------- |
| **Pros**   | Zero new config surface            | Works for global installs               | Covers both install shapes               |
| **Cons**   | Blind to global installs           | New schema surface to maintain          | Two sources, needs a precedence rule     |
| **Risk**   | Inert in the exact reported case   | Inert for adopters who never set it     | Low                                      |
| **Effort** | Low                                | Low                                     | Low                                      |

**Chosen: C.** Option A is disqualified by measurement, not preference: this
repo's root `package.json` declares only `@harness-engineering/eslint-plugin`
among harness packages, there is no `node_modules/@harness-engineering/cli`, and
the offending binary in the incident was a _global_ install. Under A the guard
would have been inert in precisely the situation that motivated it. The
`harness.config.json` field is therefore load-bearing rather than speculative.
The `package.json` dependency range is kept as a fallback because for adopters
who _do_ install locally it is a pin they already maintain, and reading it costs
nothing.

Precedence: explicit config pin wins over an inferred dependency range, because
one is a statement of intent and the other is an artifact of package management.

### D2 — What does "differs sharply" mean?

|            | A) Any major difference refuses | B) Major delta ≥ 2 refuses | C) Satisfies-range first, then a delta ladder  |
| ---------- | ------------------------------- | -------------------------- | ---------------------------------------------- |
| **Pros**   | Simplest rule to state          | Tolerates routine upgrades | Uniform across both sources; no false refusals |
| **Cons**   | Breaks every mid-upgrade repo   | Ignores intra-major pins   | Two-step rule to document                      |
| **Risk**   | High — hostile to adopters      | Medium                     | Low                                            |
| **Effort** | Low                             | Low                        | Low                                            |

**Chosen: C.** Both sources naturally yield a semver _range_ (`^11.1.1` from a
dependency, `>=11` from a hand-written pin), so range satisfaction is the honest
primary test, and it makes the whole guard silent in the overwhelmingly common
case where nothing is wrong. Only when the range is _not_ satisfied does severity
need deciding, and there the delta ladder applies:

```
satisfies(CLI_VERSION, range)                        -> ok        (silent)
otherwise, delta = minVersion(range).major - CLI major:
  delta >= 2                                         -> refuse
  delta == 1                                         -> warn
  delta <= 0                                         -> warn
```

Rationale for the thresholds:

- **≥ 2 refuses.** Two or more majors behind is not an upgrade in progress; it is
  a different tool. The incident was a delta of 10.
- **Exactly 1 warns rather than refuses.** Being one major behind is the normal
  state of a repository partway through an upgrade. Refusing there would convert
  this guard from a safety net into an outage, and would guarantee it gets
  disabled wholesale.
- **delta ≤ 0 warns.** This covers two cases: an unsatisfied pin _within_ a major
  (`^11.2.0` pinned, `11.1.1` running — a minor gap, never worth blocking) and a
  CLI _ahead_ of the pinned major. Being ahead is a genuinely milder failure than
  being behind: a newer scanner may report rules the workspace has not adopted
  yet, which is noise, whereas an older scanner re-reports findings the workspace
  has already justified, which is falsehood. Noise is a warning; falsehood, at
  sufficient distance, is a refusal.

Range satisfaction is full-precision; only the **severity** decision is
major-only. This keeps the config pin low-maintenance — a repo pinning `>=11`
needs no edit across the entire v11 line — while still letting a narrower pin
like `^11.2.0` produce an honest warning against `11.1.1`.

### D3 — Which commands does the guard gate?

|            | A) Every command         | B) Allowlist of findings-producing commands | C) Everything except a recovery set |
| ---------- | ------------------------ | ------------------------------------------- | ----------------------------------- |
| **Pros**   | No gaps                  | Scoped to the actual failure mode           | Few gaps, keeps recovery working    |
| **Cons**   | Bricks `doctor`/`update` | New commands must opt in                    | Large blast radius; denylist drifts |
| **Risk**   | High                     | Low                                         | Medium                              |
| **Effort** | Low                      | Low                                         | Low                                 |

**Chosen: B.** The report's ask is specific — "refuse to **scan**" — and the harm
is specific to commands whose output is a findings list that a human or a
conductor will act on. Gating everything is actively dangerous: `harness doctor`
and `harness update` are the commands a user needs _most_ when their toolchain is
wrong, and a guard that blocks its own remedy is a trap. An explicit allowlist,
exported as a single reviewable constant, also means the gated set can be
asserted in a test rather than inferred.

The gated set is every findings-producing command. The objective membership
test is the `--findings-json` contract flag — that is the machine-readable output
an orchestrator parses and schedules on, which is exactly what a stale scanner
corrupts: `check-arch`, `check-deployment`, `check-deps`, `check-docs`,
`check-security`, `cleanup`, `cross-check`. Four more produce findings without
the contract flag: `check-perf`, `check-harness-strength`, `validate`,
`review-ci`. Eleven in total.

A test derives the `--findings-json` family from source and asserts the set
covers it, so a new findings producer cannot ship ungated. Membership tests
alone would only catch renames, not omissions.

Deliberately **not** gated: `doctor`, `update`, `setup`, `init`, `--version`,
`--help`, and everything else. `doctor` in particular should _report_ the
mismatch, which it can do by reusing the same evaluator.

### D3a — What exit code does a refusal use?

`packages/cli/src/utils/errors.ts:4-20` defines exactly four codes. The choice
matters more than it looks:

- **`VALIDATION_FAILED` (1) — rejected.** This is what `check-docs` and
  `check-security` return when they found _real findings_. A refusal exiting 1 is
  indistinguishable to an automated consumer from "the scan ran and found
  problems," which is precisely the confusion this change exists to eliminate.
- **`ERROR` (2) — rejected.** Defensible, but it conflates "your toolchain is
  stale" with "the command malfunctioned," and it is the code an unhandled throw
  already produces.
- **`ZERO_DENOMINATOR` (3) — chosen.** Its own doc comment reads: "The command
  ran but examined NOTHING — a zero denominator. […] A gate that matched,
  compared, or fetched zero items has **abstained, not passed**, and must never
  read as green." A refusal is an abstention: nothing was examined, nothing
  malfunctioned, and the one thing that must not happen is for it to read as a
  pass. It is a general-purpose code, not roadmap-specific.

### D4 — Is an escape hatch needed, and what does it suppress?

|            | A) No hatch                     | B) `HARNESS_SKIP_VERSION_GUARD=1` silences everything | C) Hatch downgrades refusal to warning |
| ---------- | ------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| **Pros**   | Cannot be defeated              | Simple                                                | Unblocks without hiding                |
| **Cons**   | No path for legitimate cases    | Recreates the silent failure it exists to prevent     | Slightly more to explain               |
| **Risk**   | High — becomes a support burden | High — a set-and-forget var restores the incident     | Low                                    |
| **Effort** | —                               | Low                                                   | Low                                    |

**Chosen: C.** Legitimate cross-version use exists — bisecting across a major
boundary, deliberately reproducing an old scanner's output, or an adopter who
must keep CI on the old CLI for one more day. An unbypassable gate in a CLI is a
support burden that gets solved by pinning an old version forever, which is worse.

But option B would reintroduce the exact defect this change exists to prevent: a
`HARNESS_SKIP_VERSION_GUARD=1` exported once in a shell profile or a CI config
would restore silent phantom findings permanently, and nobody would remember it
was set. So the hatch is scoped to suppress the **refusal**, never the **notice**.
With the hatch set and a sharp mismatch present, the warning is still printed to
stderr on every run. The escape hatch buys you a working command; it does not buy
you a quiet one.

Name: `HARNESS_NO_VERSION_GUARD`. The repo's two existing suppression variables
are `HARNESS_NO_UPDATE_CHECK` (`packages/core/src/update-checker.ts:34`) and
`HARNESS_SUPPRESS_CONFIG_WARNINGS` (`packages/cli/src/config/loader.ts:88`);
there is no `HARNESS_SKIP_*` anywhere, so `HARNESS_NO_*` is the convention.
Truthiness is tested with the existing `envEnabled()` helper
(`packages/cli/src/utils/env-flag.ts`), which accepts `1`/`true`/`yes`/`on`
case-insensitively — hardcoding `=== '1'` would refuse a user who exported
`=true`, which is a bug report waiting to happen.

### D5 — What happens when no expected version can be determined?

**Chosen: proceed silently.** No config pin and no dependency range means the
guard has nothing to compare against. Warning in that case would fire on every
adopter who has not opted in, training everyone to ignore the guard's output —
which destroys the signal for the case that matters. An undeterminable version is
recorded in the evaluator's result as a distinct outcome (`unknown`) so that
`doctor` can surface it as an advisory, but it never gates and never warns during
a scan.

This is an accepted limitation and worth stating plainly: **the guard is
forward-looking.** It cannot help against a CLI old enough to predate the guard
itself — v1.13.1 will never refuse anything, because it does not contain this
code. What it does is ensure that from this version onward, the same class of
drift surfaces loudly. That is why the documentation half of this change is not
decorative: until stale binaries age out, the `PATH`-shadowing trap has to be
written down where the people who set `PATH` will read it.

## Technical design

### New module: `packages/cli/src/utils/version-guard.ts`

Placed beside `node-version.ts` as its sibling. The module is a pure evaluator
plus a resolver; it performs no I/O beyond reading two JSON files, and it never
writes, prints, or exits. All printing and exiting is the caller's job, which
keeps the decision logic directly unit-testable.

```ts
export type VersionGuardStatus = 'ok' | 'unknown' | 'warn' | 'refuse';
export type ExpectedVersionSource = 'config' | 'dependency';

export interface ExpectedVersion {
  /** The raw semver range as written by the workspace. */
  range: string;
  source: ExpectedVersionSource;
}

export interface VersionGuardResult {
  status: VersionGuardStatus;
  cliVersion: string;
  expected?: ExpectedVersion;
  /** minVersion(range).major - major(cliVersion); absent when status is 'unknown'. */
  majorDelta?: number;
  /**
   * True when a refusal was downgraded by the escape hatch. When set, `status`
   * is rewritten to 'warn' — callers branch on `status` alone, so the bypass
   * must be expressed there rather than as a flag the caller has to remember.
   */
  bypassed: boolean;
  /** Human-readable explanation; empty string when status is 'ok' or 'unknown'. */
  message: string;
}

export function resolveExpectedVersion(
  projectRoot: string,
  configPathOverride?: string
): ExpectedVersion | undefined;
export function evaluateVersionGuard(
  cliVersion: string,
  expected: ExpectedVersion | undefined,
  opts?: { bypass?: boolean }
): VersionGuardResult;
```

`resolveExpectedVersion` reads, in precedence order (D1):

1. `harness.config.json` → `toolchain.cliVersion`.
2. `<projectRoot>/package.json` → `devDependencies` then `dependencies` for
   `@harness-engineering/cli`.

**The config file is read directly** with `readFileSync` + `JSON.parse`, _not_
through `resolveConfig`. Two reasons, both disqualifying for the loader:

- `resolveConfig` → `loadConfig` → `warnStrippedKeys`
  (`packages/cli/src/config/loader.ts:77,87`) writes to `process.stderr` for
  every stripped key. Commands that also load config (`check-deps`, `cleanup`,
  `validate`) would emit those warnings **twice**, violating success criterion 1.
- `resolveConfig()` with no argument searches from `process.cwd()` via
  `findConfigFile()`, ignoring the `projectRoot` it was given. The signature is
  unimplementable against it.

The direct read mirrors the error-swallowing `readPackageDeps` shape at
`packages/cli/src/commands/advise-skills.ts:19`.

**Every range from either source is validated with `semver.validRange()` before
use, and anything invalid is treated as `unknown`.** This is not defensive
padding — it is required for correctness. Measured against the repo's own
`semver@^7.7.4`, `semver.minVersion()` _throws_ on `latest`, `workspace:*`,
`file:../cli`, and returns `null` on an unsatisfiable range like `>=11 <10`.
A user writing `"toolchain": { "cliVersion": "latest" }` would otherwise get a
`TypeError` raised inside a `preAction` hook, which `parseAsync` rejects into
`handleError` — bricking all eight guarded commands on a typo'd pin. A version
guard that breaks the CLI when misconfigured is worse than the drift it prevents.
The `minVersion() === null` case is likewise mapped to `unknown`.

The non-semver filter therefore applies to **both** sources, not just
`package.json`. `workspace:*` and friends say nothing about a published version;
coercing them would manufacture false mismatches in monorepos.

Project root is located by walking up for `harness.config.json`, reusing the
`findProjectRoot` idiom at `command-telemetry.ts:27-35`. When the global
`-c/--config <path>` option is present it takes precedence over the walk-up
result, so that `harness check-deps -c /other/harness.config.json` guards against
the same config the command scans with — otherwise the guard and the command
would disagree about which workspace they are in.

`evaluateVersionGuard` implements the D2 ladder. It is a pure function of its
arguments — no `process.env`, no `process.cwd()` — so the bypass flag is passed
in by the caller rather than read internally. Every branch is directly testable.

Two additional cases it maps to `unknown` rather than gating:

- `cliVersion === '0.0.0'`. `packages/cli/src/version.ts:6-10` falls back to
  `'0.0.0'` when its `createRequire('../package.json')` resolution throws.
  Against this repo's own `>=11` pin that is a major delta of 11 — so any
  packaging or bundling regression would silently convert into a blanket refusal
  of every scan command. The sentinel must never gate.
- A `cliVersion` that is not itself valid semver.

### Wiring: a root `preAction` hook

A single root-level hook installed from `createProgram()` in
`packages/cli/src/index.ts`, alongside the existing command registration:

```ts
installVersionGuard(program, process.cwd());
```

**Placement note.** `installCommandTelemetry` is called from
`packages/cli/src/bin/harness.ts:29`, _outside_ `createProgram()`. The guard is
installed _inside_ it instead — deliberately, so that the program object
`createProgram()` returns is already guarded for every consumer (and so success
criterion 7 can assert the guarded set against that same object). The installer
still copies telemetry's internal structure, including the
`typeof program.hook !== 'function'` test-environment guard at
`command-telemetry.ts:47`.

```ts
program.hook('preAction', (_thisCommand, actionCommand) => {
  const path = resolveCommandPath(actionCommand);
  if (!GUARDED_COMMANDS.has(path)) return;
  const expected = resolveExpectedVersion(root, actionCommand.optsWithGlobals().config);
  const result = evaluateVersionGuard(CLI_VERSION, expected, {
    bypass: envEnabled(process.env['HARNESS_NO_VERSION_GUARD']),
  });
  if (result.status === 'warn') {
    /* stderr */ return;
  }
  if (result.status === 'refuse') {
    /* stderr + exit ZERO_DENOMINATOR */
  }
});
```

**The command-name helper must be prefix-free.** `resolveCommandName` in
`command-telemetry.ts:77-88` returns a `cli/`-prefixed path — `harness validate`
resolves to `cli/validate`, not `validate`. That prefix is _telemetry's_
namespace (it separates CLI adoption records from hook records). Reusing it
verbatim would make `GUARDED_COMMANDS.has(...)` always false, and the guard would
be a permanent silent no-op — the very failure class this change exists to
prevent, reproduced inside the fix.

The guard therefore carries its own prefix-free `resolveCommandPath()` returning
`validate` / `graph.scan`. **The two traversals are deliberately not unified.**
Collapsing them requires editing `command-telemetry.ts`, and that file holds a
pre-existing, already-annotated PostHog ingest key which the `review-ci`
heuristic path flags whenever the file enters a diff (the `harness-ignore`
suppression is honored by the security scanner but not by that path). Editing it
would drag an unrelated security finding into this change's review surface for no
benefit to §5. A test pins the divergence so the duplication is visible and
intentional rather than accidental; unifying the helpers — and fixing the
suppression gap that makes unification expensive — is a worthwhile follow-up, not
a prerequisite.

`GUARDED_COMMANDS` is an exported `ReadonlySet<string>` holding the eight
**top-level** names from D3, so a test can assert every entry corresponds to a
registered command — preventing the set from rotting as commands are renamed.
The set must be matched against the full dotted path, not a bare name: `validate`
and `update` are ambiguous as bare names (there are nested `skill validate`,
`linter validate`, `skill update`, `perf update` commands), but they resolve to
`skill.validate` / `perf.update` and so cannot collide with the top-level
entries.

### Refusal output

The message must be actionable on its own, because the person reading it usually
does not yet know they have two `harness` binaries. It names both versions, the
source of the expectation, the resolved path of the binary that is actually
running, and the hatch:

```
harness: refusing to run `check-security`.

  This CLI is v1.13.1, but the workspace expects >=11 (harness.config.json).
  A scanner 10 major versions behind will report findings this workspace has
  already resolved.

  Running binary: /Users/…/.nvm/versions/node/v22.20.0/bin/harness
  Node:           /Users/…/.nvm/versions/node/v22.20.0/bin/node

  Check `which -a harness` — a Node bin directory added to PATH may be
  shadowing the intended install.

  To run anyway (the warning stays): HARNESS_NO_VERSION_GUARD=1
```

Printing the running binary path is the single highest-value line: the incident
was invisible precisely because nobody could see _which_ `harness` was running.
The script path comes from `process.argv[1]` and the interpreter from
`process.execPath`. Note that for a global install `process.argv[1]` is the
_resolved_ `…/dist/bin/harness.js` target rather than the `bin/harness` symlink
the user typed. That is the more diagnostic of the two — it names the install
that is actually executing — but the message must not imply otherwise, so it is
labelled `Running binary` against the resolved path and the accompanying
`which -a harness` hint is what surfaces the shadowing symlink.

Exit code: `ExitCode.ZERO_DENOMINATOR` per D3a.

### Config schema addition

In `packages/cli/src/config/schema.ts`, added to `HarnessConfigSchema`:

```ts
toolchain: z
  .object({
    cliVersion: z.string().optional(),
  })
  .optional(),
```

Nesting under `toolchain` rather than a flat `cliVersion` key is deliberate: the
config already has a top-level `version: z.literal(1)` (the schema version) and a
`template.version` (a number), so a bare `cliVersion` at the root would be the
third differently-meaning `version`-ish key. `toolchain` scopes it unambiguously.

**Important:** `HarnessConfigSchema` strips unknown keys, mitigated only by the
stderr warning in `warnStrippedKeys` (`config/loader.ts:87`). A pin added to a
config without the schema change would be silently discarded, so the schema
change is a hard prerequisite, not a nicety.

### Dogfooding

This repo's own `harness.config.json` gains `"toolchain": { "cliVersion": ">=11" }`.
Because comparison is major-only, this pin needs no maintenance across the v11
line, and it makes the guard live in the repository that produced the incident
rather than shipping a mechanism nothing exercises.

### Documentation

`docs/reference/fleet-family.md` gains a **Runtime preconditions** section,
placed adjacent to the existing "The worktree push-path caveat" section, which is
the established home for family-wide environment gotchas. It states three things:

1. Node ≥ 22 is required (native `better-sqlite3` ABI).
2. Pin the interpreter by absolute path. Do **not** prepend a Node bin directory
   to `PATH` to obtain it — those directories can contain their own `harness`
   shim, and prepending silently substitutes a different CLI for every child
   process.
3. Verify `harness --version` before trusting scan output; a stale scanner
   re-reports already-justified findings without erroring.

Per the content rules for shipped artifacts, this text carries **no** issue, PR,
or roadmap numbers — the reference is read in adopter projects. It describes the
failure shape generically, not the specific incident.

No `-fleet` `SKILL.md` body is edited. The family reference is the documented
single home for the family-wide statement, and editing eleven skill bodies to say
the same thing is the copy-paste the reference exists to prevent.

## Integration points

**Entry points**

- New module `packages/cli/src/utils/version-guard.ts` (`resolveExpectedVersion`,
  `evaluateVersionGuard`, `installVersionGuard`, `GUARDED_COMMANDS`).
- One new call in `createProgram()` at `packages/cli/src/index.ts`.
- New optional `toolchain` object on `HarnessConfigSchema`.
- New env var `HARNESS_NO_VERSION_GUARD`.
- `resolveCommandPath` extracted in `packages/cli/src/bin/command-telemetry.ts`
  (behavior-preserving: telemetry keeps emitting `cli/`-prefixed names).

**Registrations required**

- None for command discovery — this adds no command, so `_registry.ts` does not
  change and no barrel regeneration is required for the guard itself.
- A changeset is required (patch on `@harness-engineering/cli`).

**Documentation updates**

- `docs/reference/fleet-family.md` — new Runtime preconditions section.
- `docs/reference/configuration.md` — the `toolchain` key. This file is
  **hand-maintained**: `scripts/generate-docs.mjs` emits only
  `cli-commands.md`, `mcp-tools.md`, and `skills-catalog.md`, and
  `configuration.md` carries no generated-file banner. The key is written by
  hand into the top-level fields section.

**Architectural decisions**

None. This is a small, additive guard reusing three established patterns
(`node-version.ts`'s check shape, `install-constraints.ts`'s
declared-minimum-version refusal, and `command-telemetry.ts`'s root hook). It
introduces no new architectural concept that would warrant a standalone ADR.

**Knowledge impact**

One concept worth recording: _a stale analysis tool is more dangerous than a
broken one, because its output is well-formed_. This generalizes past this guard
to any cached, pinned, or vendored analyzer in the pipeline.

## Success criteria

Phrased as EARS statements; each is observable and testable.

1. When the running CLI's version satisfies the workspace's declared range, the
   guard shall produce no output and shall not alter the exit code.
2. When no expected version can be resolved, the guard shall report `unknown` and
   shall not warn, print, or gate.
3. When the running CLI's major version is 2 or more majors below the minimum of
   the declared range, and the invoked command is in `GUARDED_COMMANDS`, the
   system shall print a refusal naming both versions and the running binary path,
   and shall exit `ZERO_DENOMINATOR` (3) without running the command.
4. When the major delta is exactly 1, or the range is unsatisfied at a delta of 0
   or less, the system shall print a warning to stderr and shall run the command.
5. If `HARNESS_NO_VERSION_GUARD` is truthy per `envEnabled`, then the system
   shall report status `warn` with `bypassed: true` instead of `refuse`, and
   shall still print the mismatch warning to stderr.
6. When a command outside `GUARDED_COMMANDS` is invoked, the guard shall not
   gate it, regardless of mismatch severity — verified specifically for `doctor`
   and `update`.
7. Every name in `GUARDED_COMMANDS` shall correspond to a **top-level** command
   registered on the program built by `createProgram()`, matched against the
   prefix-free dotted path.
   7a. `resolveCommandPath` shall return `validate` for `harness validate` and
   `graph.scan` for `harness graph scan` (no `cli/` prefix), while
   `command-telemetry` shall continue to record `cli/`-prefixed names.
   7b. If a declared range is not valid semver (`latest`, `workspace:*`, `file:…`)
   or is unsatisfiable, then the guard shall report `unknown` and shall not
   throw.
   7c. When `CLI_VERSION` is the `'0.0.0'` resolution-failure sentinel, the guard
   shall report `unknown` and shall not gate.
   7d. When the global `-c/--config <path>` option is supplied, the guard shall
   resolve the expected version from that config file.
8. When `harness.config.json` declares `toolchain.cliVersion`, the loaded config
   shall retain it (i.e. it is not stripped by the schema).
9. When both a config pin and a `package.json` dependency range are present, the
   config pin shall be the one used.
10. When the `package.json` range uses a non-semver protocol (`workspace:*`,
    `file:`, `link:`, `git+`, `*`, `latest`), it shall be ignored rather than
    coerced.
11. The section added to `docs/reference/fleet-family.md` shall state the
    Node-22 precondition, the absolute-path pinning rule, and the
    `PATH`-shadowing trap, and shall contain no issue, PR, or roadmap numbers.
    (Scoped to the added section — the rest of the file is pre-existing and out
    of scope for this change.)

**Explicitly not a criterion:** wiring the `unknown` status into `harness doctor`
as an advisory. `doctor` builds a `CheckResult[]` and adapting the guard's result
into that shape is a separate, additive change; D5 names the affordance, this
change does not spend it.

## Implementation order

1. **Evaluator core.** `version-guard.ts` with `evaluateVersionGuard` and
   `resolveExpectedVersion`, plus unit tests covering criteria 1–5 and 9–10.
   Pure logic first, no wiring.
2. **Config schema.** Add `toolchain.cliVersion`; test criterion 8.
3. **Wiring.** Lift the dotted-name helper out of `command-telemetry.ts`, add
   `installVersionGuard` and the `createProgram()` call; test criteria 6–7.
4. **Dogfood + docs.** Pin this repo's `harness.config.json`, write the
   fleet-family Runtime preconditions section, regenerate any generated config
   reference; verify criterion 11.
5. **Changeset, build, full verification.**
