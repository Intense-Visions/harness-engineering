# Promote domain skills from advisory prose to load-bearing checks

**Roadmap item:** `promote-5-domain-skills-from-advisory-to-load-bearing-checks`
**Keywords:** domain-skills, load-bearing, security-scan, accessibility, aria, injection, idempotency, csrf, rate-limiting, false-positive-floor

## Overview

Five domain skills carry genuine domain-specific assertions but are prose-only advisories: `api-idempotency-keys`, `owasp-injection-prevention`, `owasp-csrf-protection`, `owasp-rate-limiting`, and `a11y-aria-patterns`. The roadmap item asks that each be wired as a load-bearing mechanical check invoked by its parent harness skill (`harness-api-design`, `harness-security-scan`, `harness-accessibility`).

These are security and accessibility gates. The governing constraint is that **a mechanical check that false-positives is worse than an advisory** — a noisy gate trains reviewers to ignore it and erodes trust in every other harness check. So the decision for each skill is not "can we pattern-match something" but "can we pattern-match it at a near-zero false-positive rate." Where the answer is no, the honest outcome is to keep the skill advisory and say why, rather than ship a noisy check.

This proposal mechanizes the two skills where a high-precision check is feasible and explicitly defers the three where it is not.

## What ships (mechanized, load-bearing)

### 1. `owasp-injection-prevention` → `harness-security-scan`

The parent already invokes `SecurityScanner.scanFiles()` from `@harness-engineering/core`, and the scanner's injection rule set already enforces the skill's core anti-patterns: `SEC-INJ-001` (`eval`/`Function`), `SEC-INJ-002` (SQL string concatenation), `SEC-INJ-003` (command injection). The one concrete gap the skill names but the scanner did not cover is the ORM raw-query escape hatch — the skill's "ORMs do NOT automatically protect you" section.

Added **`SEC-INJ-004` (Prisma raw query injection)**: fires on `$queryRawUnsafe`/`$executeRawUnsafe` called with an interpolated template literal (`` `...${x}...` ``) or a concatenated string (`... + x`). This is a near-zero-FP signal:

- The `*Unsafe` variants exist precisely because they do **not** parameterize interpolations — the name is the contract.
- The rule fires **only** when the argument is interpolated/concatenated. A fully static `$queryRawUnsafe("SELECT 1")` and the parameterized positional form `$queryRawUnsafe("... $1", id)` are not flagged (no injection vector).
- The safe tagged-template form `` prisma.$queryRaw`...${id}` `` and the `Prisma.sql` helper are never matched.

Because the parent already invokes the scanner generically, this rule is load-bearing the moment it registers — no new CLI surface. `harness-security-scan`'s Harness Integration now documents that `SEC-INJ-*` is the enforcement of this skill.

**Left advisory:** NoSQL/MongoDB operator injection (unvalidated request body passed to `find`/`findOne`) and second-order injection both require framework-aware data-flow/taint analysis. Detecting them by pattern would be noisy; they remain prose here and are covered by `/harness:security-review`.

### 2. `a11y-aria-patterns` → `harness-accessibility`

New `AriaScanner` in `@harness-engineering/core` (`packages/core/src/accessibility/`), modeled on `SecurityScanner`: regex rules evaluated per line, one finding per match. `harness-accessibility` invokes it in its SCAN phase exactly the way `harness-security-scan` invokes `SecurityScanner`. Two rules, both decidable from a single element:

- **`A11Y-014`** — `aria-hidden="true"` on a focusable element (ARIA rule #4). Restricted to natively-focusable tags (`button`, `input`, `select`, `textarea`, and `<a>` only when it carries `href`). A dynamic binding `aria-hidden={expr}` is excluded (may resolve to false); `aria-hidden="false"` is excluded; non-focusable `<span>`/`<div>` are excluded.
- **`A11Y-042`** — positive `tabindex`. `tabIndex={0}` (natural order) and `tabIndex={-1}` (programmatic focus) are not flagged; only `>= 1` matches.

These two codes already existed in `harness-accessibility`'s advisory taxonomy; they are now backed by a real scanner rather than eyeballed grep output.

**Left advisory:** accessible-name presence (`aria-label`/`aria-labelledby`), role-appropriate keyboard operability, and live-region/state-attribute correctness. Each requires resolving relationships across elements or runtime state and cannot be enforced at a low FP rate by pattern matching.

## What is deferred (remains advisory, with reason)

### 3. `owasp-csrf-protection` — deferred

Whether a route needs CSRF defense depends on its authentication model (a Bearer-token API is immune; a cookie-session route is not) and on whether a token or `SameSite` cookie is threaded through middleware. This is missing-control detection requiring framework-aware data-flow. There is no low-FP positive anti-pattern to flag (`sameSite: 'none'` and comparing tokens are legitimate in context). A pattern-based "missing CSRF protection" gate would be noisy. Deferred to `/harness:security-review`.

### 4. `owasp-rate-limiting` — deferred

"This endpoint should be rate-limited but isn't" is a missing-control judgment that requires tracing route definitions to their middleware chain plus business context about which operations are sensitive. No low-FP positive signal exists. Deferred.

### 5. `api-idempotency-keys` — deferred

Two blockers. (a) The core assertion — "mutating endpoints with side effects must accept and enforce an idempotency key" — is scoped to only the financially/data-integrity-sensitive subset of mutations, not every POST/PATCH/DELETE; deciding which qualify, and confirming the key is stored and enforced, needs semantic handler understanding. (b) The parent `harness-api-design` has no code-level scanner to mirror (its analysis is agent-driven OpenAPI/route reading); the only low-FP concrete anti-pattern (advertising `Idempotency-Key` on a GET) has near-zero real-world signal and would not justify a new OpenAPI-parsing verifier subsystem. Deferred; `harness-api-design` continues to review idempotency in its DESIGN/VALIDATE phases.

## Rationale for a partial ship

The roadmap item scoped five conversions at "roughly one week each." A truthful reading of the false-positive floor is that only two admit a high-precision mechanical check today. Shipping the two cleanly and documenting the three deferrals — in the skill files, here, and in the PR — is the outcome that respects the "noisy security gate is worse than an advisory" constraint. Three of the five stay advisory not for lack of effort but because low-FP mechanization is not achievable without the semantic/taint analysis that `/harness:security-review` and `harness-api-design`'s agent phases already provide.

## Testing

- `SEC-INJ-004`: rule-level pattern tests (violating template/concat forms flagged; static, positional, and tagged-template forms clean) in `packages/core/tests/security/rules/injection.test.ts`.
- `AriaScanner`: rule catalog + per-rule violation/clean fixtures + scanner surface (file/line reporting, clean markup passes, non-markup extensions skipped) in `packages/core/tests/accessibility/aria-scanner.test.ts`.

## Success criteria

- `SEC-INJ-004` fires on interpolated `$queryRawUnsafe`/`$executeRawUnsafe` and is silent on safe forms; reachable through `harness-security-scan`'s existing scanner invocation.
- `AriaScanner` produces `A11Y-014` and `A11Y-042` at a near-zero FP rate and is invoked by `harness-accessibility`'s SCAN phase.
- The three deferred skills state, in-repo, why they remain advisory.
- No shipped skill text contains internal roadmap/PR/issue identifiers.
