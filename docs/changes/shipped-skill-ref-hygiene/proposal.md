# Strip Internal Roadmap/PR References from Shipped Skills & Artifacts

## Overview

Harness skills, slash commands, subagent definitions, and the generated
marketplace plugin bodies (`.claude-plugin/`, `.cursor-plugin/`,
`.gemini-extension/`, `.codex-plugin/`) are copied verbatim into every project
that ADOPTS harness engineering. Several of these surfaces embed
harness-engineering-INTERNAL references — roadmap item numbers, PR numbers,
issue numbers, and craft/design sub-project indices (`(#1)`, `sub-project #4`) —
that are meaningless, and actively confusing, to an adopter who has zero access
to this repo's tracker.

Examples found in the shipped tree before this change:

- `outcome-eval` — "deferred to roadmap #540".
- `harness-rollback` — eval-arm dependency "#31", worked-example PRs "#752" / "#758".
- `harness-maintenance-pipeline` — "the real agent dispatcher (#679)".
- `harness-planning` / `harness-brainstorming` — "see issue #487".
- craft skills (`naming-craft`, `spec-craft`, `copy-craft`, `test-craft`,
  `knowledge-craft`, `security-craft`) — sibling/sub-project indices such as
  `naming-craft (#1)`, `craft-pipeline sub-project #6`, `docs-craft #2`.
- design skills (`detect-design-drift`, `align-design-system`,
  `audit-component-anatomy`, `audit-brand-compliance`, `harness-design-craft`,
  `harness-design-pipeline`) — `design-pipeline sub-project #1`,
  "shipped in PR #390", and matching `(#N)` indices (including
  `align-design-system`'s `skill.yaml` description).

### Goals

- Genericize every internal roadmap/PR/issue/sub-project reference in the
  shipped/distributed surfaces so the text stays meaningful WITHOUT the number
  (e.g. "deferred to roadmap #540" → "deferred to a future CI workflow
  template"; "`naming-craft` (#1)" → "`naming-craft`").
- Regenerate the affected distributed plugin artifacts so they match their
  genericized sources.
- Add a low-false-positive guard (a test over the shipped surfaces) that fails
  when a new internal reference leaks in.

### Non-Goals

- Removing internal linkage from specs, plans, commit messages, PR bodies, or
  source-code comments — those are the CORRECT home for internal references.
- Rewording genuinely pedagogical `#N` teaching (the `harness-autopilot`
  `Closes #<N>` closing-keyword example, `harness-git-workflow`'s `#N` sigil
  hazard lesson, `harness-verification`'s tracked-TODO example) or fabricated
  illustrative example numbers in worked scenarios (`harness-audit`,
  `ux-notification-copy`). These are teaching content, not internal references,
  and are allowlisted by the guard.

## Decisions

1. **Genericize, do not delete.** Every reference is rewritten to preserve its
   meaning (the skill/verifier name in prose, a description of the behavior)
   rather than dropping the sentence.
2. **Principle: rendered text = generic; code comments = internal-linkage OK.**
   The guard scopes to the surfaces an adopter actually reads.
3. **Edit sources, regenerate artifacts.** SKILL.md / skill.yaml sources under
   `agents/skills/claude-code/*` are the source of truth. Platform variants
   (codex/cursor/gemini-cli) are kept byte-identical by the existing parity
   test; the plugin command/agent artifacts are regenerated.
4. **Framed-pattern guard with an explicit allowlist.** The guard matches only
   tracker-framed forms (`roadmap|PR|issue #N`, `sub-project #N`,
   `X-craft/X-pipeline #N`, and a `` `skill` (#N) `` sub-project index) so that
   hex colors, in-document ordinals, and non-framed example numbers do not trip
   it. Genuine non-leaks are allowlisted by substring, each with a documented
   reason.

## Technical Design

- **Sources:** genericize the offending lines in `agents/skills/claude-code/*`
  `SKILL.md` and `skill.yaml`; sync the content-copy platform variants.
- **Artifacts:** regenerate the affected `.gemini-extension/commands/*.toml`
  command bodies and the `harness-planner` subagent definition (which embeds
  the planning skill body) for Claude and Cursor. Regeneration is done
  non-destructively so `pnpm generate:plugin:check` stays green (the pruning
  write-mode auto-regen never fires).
- **Guard:** `agents/skills/tests/internal-refs.test.ts` greps all shipped
  surfaces (skill bodies for every platform + generated plugin command/agent
  files) for the internal-ref pattern and fails on any non-allowlisted match.
- **MCP tool descriptions:** audited; the shipped `description:` strings carry
  no internal references (the `#N` tokens under `packages/cli/src/mcp/tools/`
  live only in code comments, which are in-scope for internal linkage).

## Success Criteria

1. `git grep -nE 'roadmap #[0-9]+|PR #[0-9]+' -- agents/skills agents/commands
.claude-plugin .cursor-plugin .gemini-extension` returns only allowlisted
   pedagogical / fabricated-example lines.
2. No `sub-project #N`, `X-craft/X-pipeline #N`, or `` `skill` (#N) `` index
   remains in any shipped surface.
3. `agents/skills/tests/internal-refs.test.ts` passes and fails when a new
   unallowlisted internal reference is introduced.
4. The platform-parity test still passes (all variants byte-identical).
5. `pnpm generate:plugin:check` exits 0 with no destructive file-set change.
6. Genericized text reads correctly to a reader with zero internal context.

## Implementation Order

1. Genericize the SKILL.md / skill.yaml sources; sync platform copies.
2. Regenerate the affected plugin artifacts.
3. Add the guard test; confirm it passes and catches a synthetic leak.
4. Add the roadmap shard + this spec; regenerate the roadmap aggregate.
