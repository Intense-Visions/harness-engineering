---
title: Make protect-config fail-closed in ambiguous cases
status: planned
keywords:
  [protect-config, hooks, fail-closed, security-floor, PreToolUse, defense-in-depth, issue-619]
roadmap: github:Intense-Visions/harness-engineering
---

# Make protect-config fail-closed in ambiguous cases

## Overview & Goals

`protect-config.js` (PreToolUse:Write|Edit, `standard` profile since #646) blocks edits to
linter/formatter configs but **fails open in five branches** (`protect-config.js:35,40,48,56,69`).
A security-flavored hook that silently yields on malformed input is failure-pattern #1.

Goal: flip the genuinely-**ambiguous** branches to fail-closed (`exit 2`) while preserving
fail-open on environmental/partial-stdin glitches, so we close the security gap without
re-introducing the issue-#619 self-DoS (`protect-config.test.ts:8-10` documents that v8
coverage intermittently delivers empty/partial stdin).

## Decisions Made

1. **Selective fail-closed (Option B).** Missing/non-string `file_path` (#4, `:56`) and the
   unexpected-error catch (#5, `:69`) → `exit 2`. Unreadable/empty/unparseable stdin (#1–3,
   `:35/:40/:48`) stay `exit 0`. Rationale: #1–3 are the partial/empty-stdin cases issue #619
   documents as non-attack environmental glitches; failing closed there would block legitimate
   writes. #4 is FP-safe because Write/Edit always carry `file_path` by schema (matcher is
   `Write|Edit`, not `*` — `profiles.ts:29`).
2. **Distinct, honest ambiguous-block message.** #4/#5 emit a separate line
   ("protect-config could not verify the edit target … refusing to allow a potentially
   unprotected config edit"), NOT the existing "protected config file" message (which would be
   untrue — the target is unknown). Gives the model an actionable reason; keeps the
   real-protected-file message accurate.
3. **#1–3 keep their existing stderr fail-open logs** — loud, not silent. No `exit 1` tier
   (Option C rejected); the hook keeps a two-code contract (0 allow / 2 block).
4. **Accept the convention divergence.** This makes protect-config the only hook that blocks on
   bad input. Justified: its _purpose_ is to deny a specific dangerous edit, whereas
   sentinel-pre/block-no-verify gate _behavior_, not target resolution. Documented in the header.

## Technical Design

- `protect-config.js`:
  - #4 (missing/non-string `file_path`, `:56-59`): `exit(0)` → `exit(2)` + new message.
  - #5 (unexpected-error catch, `:69-72`): `exit(0)` → `exit(2)` + new message.
  - #1–3 (`:35/:40/:48`): unchanged (`exit 0`, keep stderr log).
  - Header doc comment (`:4`): replace the blanket "Fail-open: parse errors and unexpected
    exceptions … exit 0" line with the split policy (fail-open on absent/partial input;
    fail-closed on a well-formed-but-unresolvable request).
- No change to `PROTECTED_PATTERNS`, `isProtected`, or the matcher.

## Integration Points

- **Entry Points:** None new. Behavior of the existing protect-config hook shifts; no new
  command, MCP tool, or skill.
- **Registrations Required:** None.
- **Documentation Updates:** the `protect-config.js` header doc comment (the policy contract);
  a changeset entry.
- **Architectural Decisions:** None rise to an ADR. Unlike sentinel→standard (ADR-0046, which
  changed the default security posture across the profile table), this is a localized
  hook-internal policy fix.
- **Knowledge Impact:** minor — reinforces "security hooks fail closed on ambiguous-but-formed
  requests, open on absent/partial input."

## Success Criteria

1. Valid JSON, missing `file_path` → `exit 2` with the new "could not verify target" message
   (NOT "protected config file").
2. Unexpected processing error → `exit 2`.
3. Empty stdin → `exit 0`; unparseable JSON → `exit 0`; unreadable stdin → `exit 0` — each still
   writes its stderr log.
4. Real protected-file write (e.g. `.eslintrc.json`) → `exit 2` with the original message
   (unchanged).
5. Normal source file write → `exit 0` (unchanged).
6. `protect-config.test.ts` updated: missing-file_path test (`:97`) flips to `exit 2` + asserts
   the distinct message; malformed-JSON (`:87`) and empty-stdin (`:92`) stay `exit 0`; add an
   unexpected-error fail-closed test if reproducible.
7. `packages/cli` suite green; `harness validate` passes; changeset present.

## Implementation Order

1. Edit `protect-config.js`: flip #4 and #5 to `exit 2` with the new message; update header.
2. Update `protect-config.test.ts` per success criteria #6.
3. Add changeset.
4. `pnpm --filter @harness-engineering/cli test` + `harness validate`.

## Tradeoffs & Risks

- protect-config becomes the only hook blocking on bad input — intentional, documented.
- #4 firing requires a Write/Edit with no `file_path`, which the schema makes near-impossible →
  near-zero false-positive blast radius.
- #5 failing closed turns a latent code bug into a write-block; mitigated — the catch wraps only
  simple regex/`basename` logic on an already-typechecked string (low throw surface).
- #1–3 remain a residual fail-open gap, knowingly accepted to preserve #619 stability; logged
  loudly so the gap is never silent.
