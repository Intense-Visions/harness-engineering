# Plan: toolchain version guard

**Spec:** `docs/changes/toolchain-version-guard/proposal.md`
**Package:** `@harness-engineering/cli`
**Base:** `origin/main` @ `255ccbe24`
**Scope:** §5 of the fleet-command first-run report only.

## Preconditions verified before planning

- Node 22 pinned by absolute path (`/Users/cwarner/.nvm/versions/node/v22.20.0/bin/node`),
  exposed through a shim directory containing **only** `node` — the nvm `bin`
  directory is never placed on `PATH`, since it carries the stale `harness`
  shim that this change exists to defend against.
- `harness` resolves to `/opt/homebrew/bin/harness`, `--version` → `11.1.1`.
- Baseline: `pnpm build` 13/13 successful; `packages/cli` tests 526 files /
  6027 tests, all passing. Any failure after this point is mine.

## Task graph

Tasks are ordered so that pure logic lands and is tested before any wiring, and
so the two behavior-preserving refactors (T2) are separated from behavior
changes (T4).

### T1 — Config schema: `toolchain.cliVersion`

**File:** `packages/cli/src/config/schema.ts`

Add to `HarnessConfigSchema` (line ~924):

```ts
toolchain: z.object({ cliVersion: z.string().optional() }).optional(),
```

**Why first:** `HarnessConfigSchema` is a closed `z.object` that strips unknown
keys, and `warnStrippedKeys` (`config/loader.ts:87`) writes a stderr warning per
stripped key. Without this, adding the pin to `harness.config.json` in T6 would
make every config-loading command emit a spurious warning. Hard prerequisite.

**Test:** `packages/cli/tests/config/` — loading a config containing
`toolchain.cliVersion` retains it. (Criterion 8.)

---

### T2 — Extract a prefix-free `resolveCommandPath`

**File:** `packages/cli/src/bin/command-telemetry.ts`

Split the existing `resolveCommandName` (lines 77-88):

```ts
export function resolveCommandPath(cmd: Command): string; // "validate", "graph.scan"
function resolveCommandName(cmd: Command): string; // `cli/${resolveCommandPath(cmd)}`
```

`resolveCommandName` keeps its exact current output, including the empty-string
case when the path is empty (it must NOT become `cli/`). Telemetry behavior is
unchanged; this is a pure refactor.

**Why this task exists at all:** the existing helper returns `cli/`-prefixed
names. Reusing it directly in the guard would make `GUARDED_COMMANDS.has(...)`
always false — a permanently silent no-op, i.e. this change reproducing its own
bug class. Caught in soundness review as B1.

**Test:** `packages/cli/tests/bin/command-telemetry.test.ts` — assert
`resolveCommandPath` returns unprefixed paths and `_resolveCommandName` still
returns `cli/`-prefixed ones. (Criterion 7a.)

---

### T3 — The evaluator: `packages/cli/src/utils/version-guard.ts`

New module, sibling of `node-version.ts`. Pure logic + two error-swallowing file
reads. **Never prints, never exits, never reads `process.env`.**

Exports: `VersionGuardStatus`, `ExpectedVersion`, `VersionGuardResult`,
`GUARDED_COMMANDS`, `resolveExpectedVersion`, `evaluateVersionGuard`.

`resolveExpectedVersion(projectRoot, configPathOverride?)`:

1. Read `configPathOverride ?? join(projectRoot, 'harness.config.json')` via
   `readFileSync` + `JSON.parse` in a try/catch. Take `toolchain.cliVersion`.
   **Not** via `resolveConfig` — it prints to stderr and ignores `projectRoot`
   (soundness B3).
2. Fall back to `<projectRoot>/package.json` `devDependencies` then
   `dependencies` for `@harness-engineering/cli`.
3. Both candidates pass through `semver.validRange()`; invalid → skip that
   source. This covers `workspace:*`, `file:`, `link:`, `git+`, `latest`.
   (`*` is a _valid_ range whose `minVersion` is `0.0.0`; it is filtered
   explicitly as uninformative.)

`evaluateVersionGuard(cliVersion, expected, { bypass })`:

```
if (!expected) return unknown
if (!semver.valid(cliVersion) || cliVersion === '0.0.0') return unknown   // S3
if (semver.satisfies(cliVersion, expected.range)) return ok
const min = semver.minVersion(expected.range)                            // may be null
if (!min) return unknown                                                 // B2
delta = min.major - semver.major(cliVersion)
status = delta >= 2 ? 'refuse' : 'warn'
if (status === 'refuse' && bypass) status = 'warn', bypassed = true       // N2
```

`GUARDED_COMMANDS`: `ReadonlySet<string>` of the eight verified top-level names
— `check-security`, `check-docs`, `check-deps`, `check-perf`,
`check-harness-strength`, `cleanup`, `validate`, `review-ci`.

**Tests:** `packages/cli/tests/utils/version-guard.test.ts` (tests mirror `src/`
under `tests/`; there is no co-located `__tests__` convention here). Cover
criteria 1, 2, 3-status, 4, 5, 7b, 7c, 9, 10. Explicitly assert **no throw** for
`latest`, `workspace:*`, `file:../cli`, `>=11 <10`.

---

### T4 — Wiring: `installVersionGuard`

**Files:** `packages/cli/src/utils/version-guard.ts` (installer),
`packages/cli/src/index.ts` (one call inside `createProgram()`).

Root `program.hook('preAction', …)` with the `typeof program.hook !== 'function'`
test-environment guard. Resolves the command path, returns early if not guarded,
resolves expected version (honoring `optsWithGlobals().config`, criterion 7d),
evaluates with `bypass: envEnabled(process.env['HARNESS_NO_VERSION_GUARD'])`.

- `warn` → `process.stderr.write(message)`, continue.
- `refuse` → `process.stderr.write(message)`, `process.exit(ExitCode.ZERO_DENOMINATOR)`.

`process.exit()` inside a `preAction` hook has direct in-repo precedent at
`check-security.ts:247-253`, and commander runs ancestor hooks before descendant
ones, so the root guard fires first.

Message content: both versions, the expectation source, `Running binary`
(`process.argv[1]`), `Node` (`process.execPath`), the `which -a harness` hint,
and the escape hatch.

**Tests:** criteria 6 and 7 — `doctor`/`update` are not gated; every
`GUARDED_COMMANDS` entry matches a top-level command on `createProgram()`.

**Regression risk checked:** no existing test imports the real `createProgram`
from `src/index` (the four `createProgram` occurrences in tests are local
helpers; `tests/bin/first-run-integration.test.ts:16` mocks it). Adding the hook
is safe.

---

### T5 — Docs

- `docs/reference/fleet-family.md` — **done during spec phase.** New "Runtime
  preconditions" section after "The worktree push-path caveat". No issue/PR/
  roadmap numbers (criterion 11).
- `docs/reference/configuration.md` — hand-write the `toolchain` key into the
  top-level fields section. This file is **not** generated (`generate-docs.mjs`
  emits only `cli-commands.md`, `mcp-tools.md`, `skills-catalog.md`).

VitePress constraints: no multi-line inline code spans, no bare angle brackets.

---

### T6 — Dogfood

`harness.config.json` gains `"toolchain": { "cliVersion": ">=11" }`. Major-only
comparison means no maintenance across the v11 line.

---

### T7 — Verification

1. `pnpm --filter @harness-engineering/cli test` — full suite, compare to the
   6027-test baseline.
2. `pnpm build` (arch scan reads the local `dist`, so build before pushing).
3. `pnpm typecheck`, `pnpm lint`.
4. `pnpm format:check` — CI gate that `harness validate` does not catch.
5. `pnpm check:changesets`.
6. `pnpm docs:build` — VitePress gate, also not caught by `harness validate`.
7. `/opt/homebrew/bin/harness validate`.
8. **Live end-to-end**: with the dogfood pin in place, run a guarded command via
   the built `dist` and confirm exit 0; then simulate a stale CLI by evaluating
   against `1.13.1` and confirm `refuse`. The whole point is a mechanism that
   demonstrably fires.
9. `.harness/arch/baselines.json` — inspect for byte-noise churn before staging.

## Checkpoints

- **After T3** — evaluator green in isolation. If the ladder is wrong, it is
  cheap to change here and expensive after wiring.
- **After T4** — full `packages/cli` suite must still be 6027 passing (plus new).
  A root `preAction` hook is the highest-blast-radius edit in this change.
- **Before push** — rebase on `origin/main`; sibling fleet lanes are running and
  generated artifacts conflict on every parallel PR.

## Out of scope (do not drift into)

The other 31 findings in the source report; `harness doctor` integration; Node
interpreter pinning beyond the existing `node-version.ts`; any edit to a fleet
`SKILL.md` body; auto-remediation of a detected mismatch.
