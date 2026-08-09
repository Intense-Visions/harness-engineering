# tsx dependency refresh + audit-exception accuracy correction

**Status:** Approved · **Tier:** Small · **Type:** dependency maintenance
**Keywords:** tsx, esbuild, tsup, bundle-require, pnpm-lockfile, audit-exceptions, dev-tooling, supply-chain-hygiene

## Overview

`package.json` carries an `auditExceptions` map: a per-advisory record of why a known
advisory is accepted rather than remediated. Each entry is a claim about the dependency
tree, and a claim can go stale when upstream ships. The entry for `GHSA-g7r4-m6w7-qqqr`
(esbuild arbitrary file read via the dev server, low severity, Windows-only, dev-only)
states a precondition:

> "...accepted pending a tsx release on esbuild >=0.28.1."

That precondition is now met upstream. This change does two things: it moves `tsx` to
the latest in-range release so its esbuild dependency leaves the vulnerable line, and it
rewrites the exception's justification so the recorded rationale matches the tree the
repo actually resolves.

**This change does not clear the advisory.** A vulnerable esbuild copy remains in the
tree, pulled by a different package. The exception stays accepted — the point of the
change is that its stated reason becomes true again.

### Goals

- Move `tsx` off `esbuild` 0.27.x to a release on the patched 0.28.x line, staying within
  the same major (no major bump).
- Restore accuracy to the `GHSA-g7r4-m6w7-qqqr` justification so it describes the
  post-change tree, names the package that actually holds the residual copy, and states
  the real fix condition.
- Preserve the lockfile's pnpm-8 format and its 23 supply-chain overrides byte-for-byte.

### Non-goals (YAGNI)

- **Adding a `pnpm.overrides` entry for esbuild.** Explicitly rejected: forcing esbuild
  0.28.x under `tsup`, which declares `^0.27.0`, is an out-of-range override of a bundler's
  own compiler and risks build-toolchain breakage that outweighs a low, dev-only,
  Windows-only advisory.
- Touching any other `auditExceptions` entry.
- Upgrading `tsup`, `vite`, or `vitepress` — out of scope for this change.
- Authoring a synthetic security regression test. This is a dependency-version change with
  no code-side sink of its own; the verification surface is the resolved tree plus the
  existing build/test gates.

## Decisions made

1. **Update `tsx` only, via the narrowest mechanism that actually stays narrow.** The
   base ranges were `^4.21.0` (root `package.json:65`), `^4.21.0`
   (`packages/core/package.json:75`), and `^4.19.0` (`packages/dashboard/package.json:62`).
   `tsx@4.23.11` satisfies all three, so this is an in-range refresh, not a major bump.

   _Rationale:_ the repo pins `packageManager: pnpm@8.15.4` while the machine-level pnpm is
   11.x, which ignores the `pnpm.overrides` field. A broad install resolved by the wrong
   pnpm would silently drop 23 supply-chain overrides and rewrite the lockfile format —
   a supply-chain regression introduced by a supply-chain fix. A narrow mechanism plus
   explicit lockfile assertions is the mitigation.

   **Mechanism correction (made during execution).** The originally-planned
   `pnpm update tsx -r --lockfile-only` was tried first and **rejected by the integrity
   assertions**: under pnpm 8 it is neither range-preserving nor targeted. It rewrote the
   three manifest ranges anyway (pnpm 8 `update` saves the resolved version back and has no
   `--no-save`) _and_ ran a full re-resolution pass that pulled in unrelated movement —
   `@algolia/*` 5.52.1→5.56.0, `canary-test-cli` 5.4.0→5.15.0, `nan` 2.27.0→2.28.0, and
   most seriously a **new `typescript@6.0.3`** admitted through transitive peer ranges while
   every workspace manifest declares `^5.x`. That change was discarded unmodified.

   The mechanism actually used: **raise the three declared floors to `^4.23.11`, then run
   plain `pnpm install --lockfile-only`.** Plain `install` is verified to be a no-op on this
   lockfile (zero diff when run against unmodified manifests), so it re-resolves only what
   the manifest edit forces. This yields the minimal diff and passes all five assertions.
   Raising the declared floor is also the more honest record: it states the version the
   advisory rationale now depends on, so the fix cannot silently regress on a future
   lockfile rewrite.

2. **Keep the advisory accepted; correct the justification instead of forcing it green.**
   `tsup@8.5.1` is the latest published `tsup` and declares `esbuild: ^0.27.0` — a caret
   range on a `0.x` version, so it is capped below `0.28.0` and cannot take the patched
   line. `bundle-require@5.1.0` (a `tsup` dependency) resolves against the same copy. The
   residual vulnerable esbuild therefore cannot be removed without an out-of-range override,
   which decision 1's non-goal rejects. The honest outcome is an accurate accepted exception,
   not a suppressed one.

3. **The rewritten justification must not imply resolution.** It states what moved (tsx),
   what remains and why (tsup's `^0.27.0` cap, no newer tsup), the unchanged risk framing
   (dev-only, Windows-only, low), and the real fix condition (a tsup release on a patched
   esbuild, `>=0.28.1`). Every one of those claims was verified against the npm registry
   rather than inherited from the prior text.

## Technical design

### Files touched

| File                                           | Change                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm-lock.yaml`                               | `tsx` 4.21.0 → 4.23.11; new `esbuild@0.28.2` entry for tsx's subtree  |
| `package.json`                                 | `tsx` floor `^4.21.0` → `^4.23.11`; GHSA-g7r4 justification rewritten |
| `packages/core/package.json`                   | `tsx` floor `^4.21.0` → `^4.23.11`                                    |
| `packages/dashboard/package.json`              | `tsx` floor `^4.19.0` → `^4.23.11`                                    |
| `.changeset/tsx-esbuild-dependency-refresh.md` | new — required once the two package manifests changed                 |

No source files change. The only manifest edits are the three `tsx` floors (same major)
and the one justification string.

Editing `packages/core/package.json` and `packages/dashboard/package.json` trips
`scripts/check-changesets.mjs`, whose `PUBLISHABLE_FILE` regex matches any
`packages/<pkg>/package.json`. A `patch` changeset for both satisfies it. An empty
no-release marker would also have been defensible — `tsx` is a devDependency in both, so
nothing consumers install actually changes — but `patch` matches existing practice for
dependency-floor changes and leaves a visible release-note record.

### Resolved-tree transition

Before, three esbuild copies resolve:

| Version | Pulled by                                          | GHSA-g7r4 (`>=0.27.3 <0.28.1`) |
| ------- | -------------------------------------------------- | ------------------------------ |
| 0.21.5  | `vite@5.4.21` (via `vitepress@1.6.4`)              | not in range                   |
| 0.25.12 | `vite@6.4.3`                                       | not in range                   |
| 0.27.7  | `tsx@4.21.0`, `tsup@8.5.1`, `bundle-require@5.1.0` | **vulnerable**                 |

After, `tsx` moves to its own patched copy and 0.27.7 survives on the tsup side only.

### Lockfile integrity assertions (blocking)

Before committing, all of the following must hold, or the change stops unmodified:

- `lockfileVersion: '6.0'` unchanged (pnpm 8 format).
- The `overrides:` block is present and byte-identical to base (23 entries).
- Overridden versions still resolve as before — spot-check `undici@7.29.0`,
  `hono@4.13.1`, `qs@6.15.3`, `tmp@0.2.7`, `nanoid@3.3.18`.
- The lockfile diff is confined to tsx/esbuild and their immediate dependencies.

A broad diff, a changed `lockfileVersion`, or a mutated overrides block is a stop
condition — not something to hand-repair.

## Integration points

- **Entry Points** — None. No CLI command, MCP tool, skill, route, or barrel export is
  added or changed. `tsx` is build/dev tooling invoked by existing package scripts.
- **Registrations Required** — None.
- **Documentation Updates** — None beyond the `auditExceptions` record itself, which is
  the canonical in-repo statement of why this advisory is accepted.
- **Architectural Decisions** — None. Small-tier dependency maintenance; no decision here
  rises to a standalone ADR.
- **Knowledge Impact** — None required. The durable fact (a caret range on a `0.x`
  dependency caps the minor, so a transitive advisory can outlive a direct-dependency bump)
  is captured in this proposal.

## Success criteria

1. `tsx` resolves to `4.23.11` in `pnpm-lock.yaml`; the only manifest edits are the three
   `tsx` floors (same major) and the justification string.
2. An `esbuild` entry `>=0.28.1` exists in the lockfile and is the copy `tsx` depends on.
   (`~0.28.0` admits the still-vulnerable `0.28.0`, so `0.28.x` alone is not sufficient.)
3. `pnpm-lock.yaml` still declares `lockfileVersion: '6.0'`.
4. The lockfile `overrides:` block is byte-identical to base and still holds 23 entries.
5. The lockfile diff touches only tsx, esbuild, and their immediate dependencies.
6. The `GHSA-g7r4-m6w7-qqqr` justification names tsup as the residual holder, states the
   `^0.27.0` cap, and does not assert the advisory is resolved.
7. No other `auditExceptions` entry is modified.
8. Typecheck, lint, unit tests, and a tsx/tsup-driven build all pass after the update.
9. `pnpm audit` still reports GHSA-g7r4 — recorded as the expected, accepted outcome.

## Implementation order

### Phase 1: Refresh tsx and correct the exception record

<!-- complexity: low -->

1. Update `tsx` to the latest in-range version, lockfile-only, with the repo-pinned pnpm.
2. Run the four lockfile integrity assertions; stop on any failure.
3. Rewrite the `GHSA-g7r4-m6w7-qqqr` justification against the verified post-change tree.
4. Materialize `node_modules` from the frozen lockfile and run typecheck, lint, unit
   tests, and a build.
5. Record before/after `pnpm audit` and the before/after esbuild inventory.
