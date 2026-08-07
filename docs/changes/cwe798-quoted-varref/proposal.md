---
feature: cwe798-quoted-varref
status: planned
tier: small
keywords:
  - security-review
  - CWE-798
  - hardcoded-secret
  - secret-reference
  - command-substitution
  - false-positive
tracks:
  - review-quality
issue: '#1095'
---

# CWE-798 secret detector: treat command-substitution values as reference-only

## Overview

The review floor's hardcoded-secret detector (CWE-798) fires `critical` on quoted
shell assignments whose value is not a literal. External issue #1095 reports that
`GH_TOKEN="$VAR"`-style lines flip the `review-ci` verdict to `request-changes`
(`exitCode: 1`) on essentially every PR that touches a GitHub Actions workflow,
even though the secret never appears in source.

A prior fix (`security/secret-reference.ts`, shipped as the reference-only guard)
already suppresses the two literal repro forms from the issue — shell/env variable
references (`$VAR`, `${VAR}`, `${VAR:-$OTHER}`) and CI expressions
(`${{ secrets.X }}`). Verified against `origin/main`: those exact repro lines are
now clean.

One form the issue explicitly calls out remains a live false positive: a **command
substitution** — `TOKEN="$(gh auth token)"` or the backtick form
``TOKEN="`gh auth token`"``. The value is produced at runtime by running a
command; no secret literal is assigned in source, yet the detector still emits a
blocking `critical`. This change extends the same shared guard to recognize
command-substitution values as reference-only.

## Problem boundary

**In scope:** Extend `isReferenceOnlySecretValue` in
`packages/core/src/security/secret-reference.ts` so a value composed solely of
command-substitution and/or variable/expression references is treated as
reference-only. Both detection tiers that already consume this predicate benefit
without further change:

- the heuristic review-tier detector (`packages/core/src/review/agents/security-agent.ts`, `detectHardcodedSecrets`)
- the deterministic secret rules (`packages/core/src/security/scanner.ts`, `SEC-SEC-*`)

**Out of scope (deliberate YAGNI):** the issue's other two suggestions — a
confidence floor for verdict-affecting findings, and making `security.exclude`
apply to `review-ci`. Both are larger, independent changes; this proposal is the
narrow, highest-leverage fix (issue suggestion #1) and stays in the family of the
existing reference-only guard.

## Decisions made

- **D1 — Extend the existing shared guard, not the two call sites.** The
  reference-vs-literal decision already lives once in `secret-reference.ts` and is
  consumed by both detection tiers (`security-agent.ts:374`,
  `scanner.ts:170`). Adding the command-substitution forms there means one edit
  fixes both tiers, exactly as the prior fix intended. _Evidence:_
  `packages/core/src/security/secret-reference.ts` (shared predicate);
  `packages/core/src/review/agents/security-agent.ts:374`;
  `packages/core/src/security/scanner.ts:170`.

- **D2 — Strip command-substitution forms `$(…)` and `` `…` `` before the residue
  check.** `isReferenceOnlySecretValue` works by removing every reference form and
  then asking whether any alphanumeric residue remains (a literal leaves residue;
  a pure reference leaves none). Command substitution is added to that strip list:
  `$( … )` (single level) and backtick `` ` … ` ``. _Evidence:_ the existing
  strip-then-residue algorithm in `secret-reference.ts` (`CI_EXPRESSION`,
  `SHELL_BRACE_VAR`, `SHELL_BARE_VAR`).

- **D3 — Conservative boundaries, documented, favoring the false positive over
  the false negative.** For a security control a false positive is safer than a
  false negative, so where the value cannot be cleanly proven reference-only it
  stays flagged:
  - **Mixed values stay flagged.** A command substitution followed by a literal
    suffix — the value `$(id)-literalsuffix` — keeps its `literalsuffix` residue
    and is still detected; only pure reference/command-substitution values are
    suppressed.
  - **Nested command substitution stays flagged.** The single-level
    `$([^()]*)` pattern does not fully consume `$(a $(b))`, leaving residue, so
    the value is conservatively still flagged. Nested command substitution in a
    `TOKEN=` assignment is not a shape real code uses.
  - **Known boundary — a literal wholly inside a command substitution**
    (`TOKEN="$(echo sk-ant-literal)"`) is treated as reference-only and therefore
    suppressed. This is accepted and documented: a command substitution assigns
    the command's runtime output, not a static literal, and hiding a secret inside
    `echo` is an adversarial evasion, not the CWE-798 "hardcoded literal" shape
    (which — written directly — is still caught). The entropy/gitleaks tiers
    remain the backstop for that pathological case. This mirrors the existing
    documented partial-literal boundary in the module.

## Technical design

`packages/core/src/security/secret-reference.ts`:

```ts
// Command substitution: `$( … )` (single level) and backtick `` ` … ` ``.
// The value is the command's runtime output — no literal is assigned in source.
const COMMAND_SUBSTITUTION = /\$\([^()]*\)/g;
const BACKTICK_SUBSTITUTION = /`[^`]*`/g;
```

These two `.replace(…, '')` calls are added to the existing strip chain in
`isReferenceOnlySecretValue`, before the final alphanumeric-residue test. The
`extractQuotedSecretValue` helper is unchanged — command-substitution values
already arrive quoted (`TOKEN="$(…)"`), and pattern 1 of `SECRET_PATTERNS`
captures the quoted value up to the closing quote.

No signature changes, no new exports, no call-site changes.

## Integration points

- **Entry Points:** None new. The two existing consumers of
  `isReferenceOnlySecretValue` (review-tier detector, deterministic `SEC-SEC-*`
  rules) inherit the behavior.
- **Registrations Required:** None. No barrel/export/registry changes.
- **Documentation Updates:** None beyond the changeset. Detector body carries no
  internal issue/PR references (it runs in adopter repos).
- **Architectural Decisions:** None rise to a standalone ADR — this is a small,
  in-family extension of an existing guard.
- **Knowledge Impact:** Reinforces the existing "reference-vs-literal" concept for
  secret detection; no new graph concepts.

## Success criteria

1. **False positive clears (review tier):** a changed file containing
   `TOKEN="$(gh auth token)"` produces zero hardcoded-secret findings from
   `runSecurityAgent`.
2. **False positive clears (backtick):** ``TOKEN="`gh auth token`"`` produces
   zero findings.
3. **Predicate unit truth:** `isReferenceOnlySecretValue("$(gh auth token)")` and
   `isReferenceOnlySecretValue("`gh auth token`")` both return `true`.
4. **Genuine secret still fires (control):** a changed line that assigns a
   literal API key directly (an `sk-ant-…` value, per the fixture in
   `security-agent.test.ts`) still produces exactly one `critical` CWE-798
   finding.
5. **Mixed value still fires (conservative boundary):**
   `isReferenceOnlySecretValue("$(id)-sk-ant-literalsuffix")` returns `false`.
6. **Nested command substitution still fires:**
   `isReferenceOnlySecretValue("$(a $(b))")` returns `false`.
7. **Issue repro remains clean (regression lock-in for the prior fix):**
   `GH_TOKEN="${AUTO_MERGE_TOKEN:-$GH_TOKEN}"` and `GH_TOKEN="$PR_CRED"` produce
   zero findings.
8. `review-ci --diff origin/main...HEAD` on this branch reports
   `blockingFindings: []` and `exitCode: 0`.

## Implementation order

1. Extend `isReferenceOnlySecretValue` with the two command-substitution strip
   forms and document the boundaries (D3).
2. Add regression tests:
   - `secret-reference.test.ts` — predicate cases (criteria 3, 5, 6, and the
     literal-inside-command-substitution boundary).
   - `security-agent.test.ts` — review-tier detector cases (criteria 1, 2, 4).
3. Verify: full build, targeted tests, `review-ci` self-scan, then the full
   pre-push gauntlet. Add a `patch` changeset for `@harness-engineering/core`.
