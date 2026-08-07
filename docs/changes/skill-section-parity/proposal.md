# Skill required-section parity: one source of truth for the two gates

**Status:** Proposed
**Keywords:** skill-validation, structure-test, required-sections, gate-drift, single-source-of-truth, rationalizations-to-reject, constraints-as-code

## Overview and Goals

Two gates check that every shipped skill carries its required Markdown sections, and they disagree. The `harness skill validate` CLI validator (`packages/cli/src/commands/skill/validate.ts`) requires `## Rationalizations to Reject` on every user-facing (behavioral) skill; the vitest structure test (`agents/skills/tests/structure.test.ts`) does not. Because the weaker gate is the one wired into `agents/skills` CI, 19 skills shipped without the section and still pass green.

This is gate drift, not 19 isolated oversights: two hand-maintained copies of the same rule list fell out of sync, and the copy with less coverage is the one that vouches for the skills. Adding the section to 19 skills fixes the symptom; making the two gates read the same list is what stops the next divergence.

Goals:

1. Make the vitest structure test enforce the same required-section list as the CLI validator (adds `## Rationalizations to Reject` for behavioral skills). This goes RED on the 19 affected skills until they are authored.
2. Author a real, domain-specific `## Rationalizations to Reject` section in each of the 19 skills. Each section addresses that skill's own shortcuts — copy-paste is explicitly wrong.
3. Remove the drift class structurally: both gates derive their section lists from a single exported constant so they cannot silently diverge again.

Out of scope: changing what sections are required (the validator's list is the accepted canon); reworking skill.yaml schema; touching non-behavioral (knowledge) skill requirements beyond wiring them to the shared source.

## Decisions Made

- **D1 — Single source of truth in `@harness-engineering/core`, not a parity assertion.** Both `packages/cli` and `agents/skills` already depend on `@harness-engineering/core` (`workspace:*`); neither the reverse (`agents/skills` does not depend on `cli`). A shared constant exported from core and imported by both gates makes drift *structurally impossible* — strictly stronger than a test that only *detects* drift after someone re-inlines a list. This aligns with the STRATEGY track "constraints-as-code outperforms prompts-and-conventions": encode the rule once, mechanically, rather than maintaining two conventions that must be kept in sync by discipline.
- **D2 — New module `packages/core/src/skills/required-sections.ts`.** Core has no `skills/` domain dir today; the section lists are skill-domain knowledge and do not belong in `context/section-parser.ts` (which parses arbitrary section headings for context assembly, a different concern). Export `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, and `RIGID_SECTIONS` as `readonly` string arrays, re-exported from `packages/core/src/index.ts`.
- **D3 — CLI validator and structure test both import the constants; no local copies remain.** `validate.ts` deletes its inline arrays and imports from core. `structure.test.ts` deletes its inline arrays and imports from core. After this change there is exactly one definition.
- **D4 — Author sections as domain-specific Markdown tables** matching the established house format (an intro sentence + a two-column `Rationalization | Why It Is Wrong` table), consistent with skills that already carry the section (e.g. `cleanup-dead-code`).
- **D5 — Shipped-body hygiene.** The 19 skills are shipped bodies that run in adopter projects. Authored sections must contain no internal roadmap/PR/issue numbers.
- **D6 — Belt-and-suspenders parity test is YAGNI.** With D1/D3 there is a single constant; a test asserting "the two lists match" would assert a constant equals itself. Skip it. (If a future reviewer wants insurance against re-inlining, a lint rule forbidding inline `'## When to Use'`-style arrays outside core is the correct shape — noted as a future consideration, not built now.)

## Technical Design

### Shared constant module

`packages/core/src/skills/required-sections.ts`:

```ts
export const BEHAVIORAL_REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
  '## Rationalizations to Reject',
] as const;

export const KNOWLEDGE_REQUIRED_SECTIONS = ['## Instructions'] as const;

export const RIGID_SECTIONS = ['## Gates', '## Escalation'] as const;
```

Re-exported from `packages/core/src/index.ts`.

### CLI validator

`packages/cli/src/commands/skill/validate.ts` drops its two inline arrays and imports `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS` from core. Logic is otherwise unchanged (it already requires the section — this only removes the duplicate literal).

### Structure test

`agents/skills/tests/structure.test.ts` drops its three inline arrays (`BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, `RIGID_SECTIONS`) and imports them from `@harness-engineering/core`. The `## Rationalizations to Reject` entry now flows in for free, turning the silent gap into a failing test until the 19 sections exist.

### The 19 authored sections

Each of these skills gets a `## Rationalizations to Reject` section placed after `## Success Criteria`/before `## Examples` (or the nearest house-format position), authored to that skill's own domain:

acceptance-eval, align-design-system, audit-brand-compliance, audit-component-anatomy, copy-craft, detect-design-drift, harness-compound, harness-design-craft, harness-design-pipeline, harness-ideate, harness-pulse, harness-strategy, knowledge-craft, naming-craft, outcome-eval, pre-merge-brief, security-craft, spec-craft, test-craft.

Platform variants (codex/cursor/gemini) are symlinks to the claude-code `SKILL.md`, so editing the claude-code source propagates automatically.

## Integration Points

- **Entry Points:** New core module `packages/core/src/skills/required-sections.ts`; new barrel export from `packages/core/src/index.ts`. No new CLI command, MCP tool, or skill.
- **Registrations Required:** Core barrel re-export of the three constants. `pnpm generate:plugin:check` must stay EXIT=0 (symlink propagation, no write-mode regen). Generated skills-catalog/docs regenerated after a full build.
- **Documentation Updates:** Regenerate generated skill docs (`pnpm run generate-docs`) since 19 shipped skill bodies gain a section. No hand-written guide change required; `harness-skill-authoring` already documents the section as mandatory.
- **Architectural Decisions:** None rise to a standalone ADR — D1 (single source of truth in core) is a local dedup, not a new architectural boundary.
- **Knowledge Impact:** Reinforces the existing "Skill Authoring" knowledge concept; no new graph nodes required.

## Success Criteria

1. `packages/core` exports `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, `RIGID_SECTIONS`; `validate.ts` and `structure.test.ts` both import them with zero remaining inline copies (grep for the inline literal arrays returns only the core module).
2. Reverting any single one of the 19 sections makes `agents/skills` vitest go RED (the gate now detects the gap it previously missed).
3. All 19 skills contain a `## Rationalizations to Reject` section with domain-specific content (no two sections share identical rationalization rows; none reference internal roadmap/PR/issue numbers).
4. `harness skill validate` reports 0 errors, and `agents/skills` vitest passes.
5. Full build, `pnpm generate:plugin:check` (EXIT=0), `pnpm format:check`, and `harness validate` all pass.

## Implementation Order

1. **Phase 1 — Shared source + failing gate.** Add the core module + barrel export, rewire `validate.ts` and `structure.test.ts` to import it. Confirm the structure test now goes RED on the 19 (proving the gate detects the gap). Build core so downstream packages resolve the new export.
2. **Phase 2 — Author the 19 sections.** Write a domain-specific `## Rationalizations to Reject` for each of the 19 claude-code skill bodies. Verify vitest goes green and `harness skill validate` reports 0 errors.
3. **Phase 3 — Regenerate + verify.** Full build, regenerate docs, `generate:plugin:check`, `prettier --write` + `format:check`, `harness validate`, changeset status. Open PR.
