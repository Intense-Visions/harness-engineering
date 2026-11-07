---
title: Let protect-config honour a recorded override decision
status: implemented
keywords: [protect-config, hooks, override-ledger, PreToolUse, audit-trail, issue-2336]
roadmap: github:Intense-Visions/harness-engineering
---

# Let protect-config honour a recorded override decision

## Overview & Goals

`protect-config.js` blocks every agent Write/Edit to a linter or formatter config by file
name and offers no way through, even when a human has already decided the change should
land (#2336). A human can still edit the file by hand, because the hook only guards agent
tool calls. So the block adds friction without protection: the one actor that would leave
an audit trail is the one that gets stopped.

Goal: add an override path that leaves an audit trail. Agent edits to a protected file are
allowed only while a human-recorded, unexpired decision names that file. Everything else
stays blocked exactly as today.

## Decisions Made

1. **A JSON ledger at `.harness/config-overrides.json`.** It has the shape
   `{ "overrides": [{ file, reason, decision, approvedBy, expires }] }`. This mirrors the
   quarantine and skip ledgers elsewhere in harness: each entry has a reason, a link to the
   decision, an owner, and an expiry. A top-level object (not a bare array) leaves room for
   a `version` field later.
2. **Match by repo-relative path, not basename.** A basename match would let one
   `eslint.config.mjs` entry unlock every same-named config in a monorepo. The repo root is
   the nearest ancestor of the edit target that contains `.git` (a directory, or a file in a
   worktree), so a worktree reads its own branch's ledger and an unrelated `.harness/` higher
   up the filesystem is never consulted.
3. **Every field is required and must be a non-empty string. `expires` must be a real
   `YYYY-MM-DD` date that is today or later, in UTC.** The expiry day is inclusive, and UTC
   keeps CI and laptops in different timezones in agreement. Partial, expired, or malformed
   entries, and a ledger that does not parse or has no `overrides` array, all count as absent.
   The edit is blocked, and the block message says which of these applied.
4. **The ledger protects itself.** `config-overrides.json` joins `PROTECTED_PATTERNS`, and
   the ledger check runs before the ledger lookup. No entry can unlock the ledger, so an agent
   can never grant itself an override. Only a human, or a reviewed PR, adds an entry.
5. **The allow path is visible.** An allowed edit writes one stderr line that names the file,
   the decision, the approver, the expiry, and the reason.
6. **Fail policy is unchanged.** Unreadable stdin and an unresolvable target still fail
   closed. Empty or unparseable stdin still fails open (#619). The header comment, which
   still said unreadable stdin fails open, now matches the behaviour since #993.

## Non-goals (follow-up)

- **Content-aware checking.** Diffing the rule set before and after the edit, and blocking
  only edits that weaken enforcement (a rule moving `error`→`warn`/`off`, a removed rule or
  plugin, wider `ignores`, a lowered threshold), is left for a later change. It needs a
  config parser per tool, and the ledger is useful without it.
- **Bash writes.** The hook guards Write/Edit tool calls only, as it did before. A shell
  redirect to a protected file, or to the ledger, is outside this hook's reach.

## Technical Design

- `findRepoRoot(dir)` walks up from the target's directory to the first ancestor containing
  `.git`.
- `findOverride(absPath)` reads the ledger, filters entries whose normalized `file`
  (backslashes → `/`, leading `./` stripped) equals the target's repo-relative POSIX path,
  and returns the first valid one, or a reason why none applies.
- A relative `file_path` resolves against the request's `cwd`, falling back to
  `process.cwd()`.
- The block message for a protected file keeps its original first sentence and adds the
  ledger as the way through, plus the specific reason this edit was not allowed.

## Integration Points

- **Entry Points:** none new. The existing hook gains an allow path.
- **Registrations Required:** none. `read-hook-stdin.js` is already a registered support file.
- **Documentation Updates:** `docs/guides/hooks-system.md` (protect-config section), the hook
  header comment, and a changeset.
- **Architectural Decisions:** none that rise to an ADR. This is a hook-local policy change.

## Success Criteria

1. A protected edit with a valid, unexpired entry for that repo-relative path → `exit 0`,
   with a stderr notice naming the entry.
2. An entry that expires today → allowed.
3. An expired entry, a missing or blank field, an invalid date, an entry for another file, a
   ledger that does not parse, or a ledger with no `overrides` array → `exit 2`, and the
   message names the cause.
4. An edit to `.harness/config-overrides.json` → `exit 2`, even with an entry naming it.
5. An entry for `packages/a/eslint.config.mjs` does not unlock `packages/b/eslint.config.mjs`
   or the root `eslint.config.mjs`.
6. All existing fail-closed and fail-open cases are unchanged.
7. `packages/cli` suite green; changeset present.
