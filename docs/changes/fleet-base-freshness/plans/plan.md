# Plan — `-fleet` verification discipline base-freshness clause (issue #1294)

## Problem

The `-fleet` family's shared VERIFY discipline treats a CI conclusion as evidence
without asking **when** it was gathered. A PR whose green CI never ran against the
base it is about to merge into satisfies every condition the spine states. When
GitHub's `required_status_checks.strict` is `false` (the default), "CI is green"
and "this change is safe on today's `main`" collapse into one — falsely. This put
a cross-client tenancy hole into a downstream repo's default branch during a
`pr-fleet` run: two individually-correct PRs, never executed together until both
were on `main`.

```
CI is green   ≠   this change is safe on today's main
```

## Decision (locked in CONFIRM — not re-opened here)

Require green CI to have run against the **current** base before a fleet may mark a
PR `verified`/merge-ready; otherwise downgrade to **degraded**.

- A member may classify a PR `verified` only if its green CI ran against current
  `main` — the branch is rebased onto (or up to date with) current `main`, **or**
  branch protection enforces strict / up-to-date-before-merge.
- If the green was gathered against a **stale** base (base moved past the tested
  SHA since CI ran), the verdict is downgraded to **degraded** — not trusted as
  verified — and the report names the stale tested base SHA vs current `main`.

## Deliverables

### 1. Spine clause — `docs/reference/fleet-family.md`

Add a first-class `## Base freshness` section to the verification-discipline area
(right after the Hard invariants), stating the `green ≠ safe-on-today's-main`
distinction, the verified-vs-degraded rule, and a pointer to the mechanical helper.
Also thread a one-line qualifier into Hard invariant #2 (the all-OS CI invariant)
so a reader of the invariants list is sent to the clause.

### 2. Member VERIFY references (concise, not restated)

Every `-fleet` member references the spine clause in its Phase 4 VERIFY:

- **CI-producing members** (`roadmap-fleet`, `pr-fleet`, `bug-fleet`,
  `cleanup-fleet`, `cicd-fleet`, `security-fleet`, `test-fleet`, `craft-fleet`,
  `adr-fleet`) — a concise base-freshness qualifier on the CI-green condition:
  a green that ran against a stale base downgrades the item to `degraded`, with the
  stale base SHA reported. `pr-fleet` (the only member that merges) gets the
  concrete form: a fourth mechanical condition plus SELECT reading
  `required_status_checks.strict` and labelling provisional through CONFIRM.
- **CI-not-applicable members** (`ideate-fleet`, `issue-fleet`) — an honest note
  that they derive no verdict from a CI conclusion, so the clause is not-applicable
  here (a skipped check and an inapplicable one must not look alike).
- **`fleet-command`** (conductor) — a lane's CI-derived `verified` is downgraded to
  `degraded` when its green ran against a stale base, consistent with the conductor's
  existing degraded-verdict vocabulary and its CI trust gate.

### 3. Mechanical helper — `@harness-engineering/core`

`packages/core/src/ci/base-freshness.ts`: a pure `classifyBaseFreshness()` that,
given the tested base SHA, current base tip SHA, whether the base advanced since the
test, and whether strict protection is enforced, returns a
`{ trust: 'verified' | 'degraded', fresh, reason }` verdict — so the clause is
mechanically checkable, not only prose. Exported via `ci/index.ts`; the `ci` dir is
an `export *` auto-discovered barrel entry, so no `generate-core-barrel.mjs`
allowlist edit is needed. Behavior test alongside.

## Verification

- `classifyBaseFreshness` behavior test green (strict-enforced, up-to-date, and
  stale-base cases).
- `pnpm run generate:barrels --check` clean (no allowlist edit needed).
- Plugin command mirrors regenerated; `pnpm run generate:plugin:check` clean.
- `harness validate` passes on the edited skills.
- pre-commit arch gate, pre-push whole-tree gates, and all-OS CI green.
