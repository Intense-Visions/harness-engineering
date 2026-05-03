# Plan: Anti-Rationalization Standard — Phase 1 (Spec & Validation Updates)

**Date:** 2026-04-07
**Spec:** docs/changes/anti-rationalization-standard/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Update skill authoring spec, validation, and template so that `## Rationalizations to Reject` is a required section enforced by `harness skill validate` and scaffolded by `create-skill`.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-skill-authoring/SKILL.md` Phase 4 documents `## Rationalizations to Reject` as a required section with the format contract (table with `| Rationalization | Reality |`, 3-8 domain-specific entries, no generic filler) and the three universal rationalizations defined once.
2. `agents/skills/claude-code/harness-skill-authoring/SKILL.md` Phase 5 validation list includes `## Rationalizations to Reject` among required sections.
3. When `## Rationalizations to Reject` is missing from a user-facing skill's SKILL.md, `harness skill validate` reports an error (because `REQUIRED_SECTIONS` in `validate.ts` includes it).
4. Running `npx harness create-skill --name test-skill --description "test"` produces a SKILL.md that contains `## Rationalizations to Reject` with a placeholder table.
5. `npx vitest run packages/cli/tests/commands/create-skill.test.ts` passes, including a test that asserts the new section is present.
6. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-skill-authoring/SKILL.md` — Add rationalizations as required section in Phase 4, add to validation list in Phase 5, add format contract and universal entries
- MODIFY `packages/cli/src/commands/skill/validate.ts` — Add `'## Rationalizations to Reject'` to `REQUIRED_SECTIONS` array
- MODIFY `packages/cli/src/commands/create-skill.ts` — Add placeholder section to `buildSkillMd` template
- MODIFY `packages/cli/tests/commands/create-skill.test.ts` — Add assertion for new section

## Tasks

### Task 1: Add `## Rationalizations to Reject` to REQUIRED_SECTIONS in validate.ts

**Depends on:** none
**Files:** `packages/cli/src/commands/skill/validate.ts`

1. Open `packages/cli/src/commands/skill/validate.ts`.

2. Change the `REQUIRED_SECTIONS` array from:

```typescript
const REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
];
```

to:

```typescript
const REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
  '## Rationalizations to Reject',
];
```

3. Run: `harness validate`
4. Commit: `feat(validation): add Rationalizations to Reject to REQUIRED_SECTIONS`

---

### Task 2: Add placeholder Rationalizations to Reject section to create-skill template

**Depends on:** none (parallel with Task 1)
**Files:** `packages/cli/src/commands/create-skill.ts`, `packages/cli/tests/commands/create-skill.test.ts`

1. Open `packages/cli/src/commands/create-skill.ts`.

2. In the `buildSkillMd` function, add a `## Rationalizations to Reject` section before the closing backtick of the template string. Insert it after `## Examples` (the last current section). The new section:

```
## Rationalizations to Reject

<!-- TODO: Add 3-8 domain-specific rationalizations. Do not repeat universal rationalizations (defined in harness-skill-authoring). -->

| Rationalization | Reality |
| --- | --- |
| "[Domain-specific excuse]" | [Why this is wrong and what to do instead] |
```

The exact change: after the Examples section closing backtick block, before the template's closing backtick, add the section above.

The full return string in `buildSkillMd` should end with:

```typescript
## Examples

\`\`\`bash
harness skill run ${opts.name}
\`\`\`

## Rationalizations to Reject

<!-- TODO: Add 3-8 domain-specific rationalizations. Do not repeat universal rationalizations (defined in harness-skill-authoring). -->

| Rationalization | Reality |
| --- | --- |
| "[Domain-specific excuse]" | [Why this is wrong and what to do instead] |
`;
```

3. Open `packages/cli/tests/commands/create-skill.test.ts`.

4. In the test `'generates SKILL.md with required sections'`, add an assertion:

```typescript
expect(content).toContain('## Rationalizations to Reject');
expect(content).toContain('| Rationalization | Reality |');
```

5. Run tests: `cd packages/cli && npx vitest run tests/commands/create-skill.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(create-skill): add Rationalizations to Reject placeholder to template`

---

### Task 3: Update harness-skill-authoring SKILL.md with format contract and universal rationalizations

**Depends on:** none (parallel with Tasks 1-2)
**Files:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md`

1. Open `agents/skills/claude-code/harness-skill-authoring/SKILL.md`.

2. **In Phase 4 (WRITE SKILL.MD), after step 8 (Escalation for rigid skills), add step 9:**

```markdown
9. **Write `## Rationalizations to Reject`.** Every user-facing skill must include this section. It contains domain-specific rationalizations that prevent agents from skipping steps with plausible-sounding excuses. Format requirements:
   - **Table format:** `| Rationalization | Reality |` with a header separator row
   - **3-8 entries** per skill, each specific to the skill's domain
   - **No generic filler.** Every entry must address a rationalization that is plausible in the context of this specific skill
   - **Do not repeat universal rationalizations.** The following three are always in effect for all skills and must NOT appear in individual skill tables:

   | Rationalization         | Reality                                                                     |
   | ----------------------- | --------------------------------------------------------------------------- |
   | "It's probably fine"    | "Probably" is not evidence. Verify before asserting.                        |
   | "This is best practice" | Best practice in what context? Cite the source and confirm it applies here. |
   | "We can fix it later"   | If worth flagging, document now with a concrete follow-up plan.             |

   Example of a good domain-specific entry (for a code review skill):

   | Rationalization                               | Reality                                                                                                                                    |
   | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | "The tests pass so the logic must be correct" | Passing tests prove the tested paths work. They say nothing about untested paths, edge cases, or whether the tests themselves are correct. |
```

3. **In Phase 5 (VALIDATE), step 1**, update the required sections list. Change:

```markdown
- `SKILL.md` has all required sections (`## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`)
```

to:

```markdown
- `SKILL.md` has all required sections (`## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`)
```

4. Run: `harness validate`
5. Commit: `feat(skill-authoring): document Rationalizations to Reject as required section with format contract`

---

### Task 4: Add Rationalizations to Reject section to harness-skill-authoring itself

**Depends on:** Task 3 (the format contract must be documented before we add our own)
**Files:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md`

[checkpoint:human-verify] — Review the rationalizations for the skill-authoring skill before committing.

1. Open `agents/skills/claude-code/harness-skill-authoring/SKILL.md`.

2. Add a `## Rationalizations to Reject` section before the `## Examples` section (or after `## Success Criteria` — consistent with the section order the spec recommends). Insert:

```markdown
## Rationalizations to Reject

| Rationalization                                                         | Reality                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "This skill is too simple to need all required sections"                | Every section exists for a reason. A short section is fine; a missing section means the skill was not fully thought through.             |
| "The process section covers it — no need for explicit success criteria" | Process describes what to do. Success criteria describe how to know it worked. They serve different purposes.                            |
| "Rationalizations to Reject is meta — this skill does not need it"      | This section is required for all user-facing skills, including this one. No exceptions.                                                  |
| "I will add examples later once the skill is proven"                    | Examples are a required section. A skill without examples forces the agent to guess at correct behavior. Write at least one example now. |
| "The When to Use section is obvious from the name"                      | Negative conditions (when NOT to use) prevent misapplication. The skill name conveys nothing about boundary conditions.                  |
```

3. Run: `harness validate`
4. Observe: passes (the skill now has all required sections including the new one).
5. Commit: `feat(skill-authoring): add domain-specific Rationalizations to Reject`

---

## Verification Trace

| Observable Truth                                                                 | Delivered by   |
| -------------------------------------------------------------------------------- | -------------- |
| 1. Skill authoring spec documents format contract and universal rationalizations | Task 3         |
| 2. Phase 5 validation list updated                                               | Task 3         |
| 3. `harness skill validate` fails on missing section                             | Task 1         |
| 4. `create-skill` generates the section                                          | Task 2         |
| 5. Tests pass                                                                    | Task 2         |
| 6. `harness validate` passes                                                     | Task 4 (final) |
