# Plan: Pipeline Skill Advisor -- Phase 1: Core Engine

**Date:** 2026-04-24 | **Spec:** docs/changes/pipeline-skill-advisor/proposal.md | **Tasks:** 7

## Goal

Build the content-based matching engine that scores skills from the index against spec/plan content, classifies matches into Apply/Reference/Consider tiers, infers "When" timing guidance, expands via related-skills graph traversal, and generates/parses a structured SKILLS.md file.

## Observable Truths (Acceptance Criteria)

1. When `extractSpecKeywords()` is called with spec text containing `**Keywords:** auth, session, oauth`, the returned array includes `['auth', 'session', 'oauth']`.
2. When `detectStackFromDeps()` is called with a `package.json` containing `"react"` in dependencies, the returned array includes `'react'`.
3. When `inferDomain()` is called with spec text mentioning "authentication" and "OAuth", the returned array includes `'auth'`.
4. When `scoreSkillByContent()` is called with a skill whose keywords perfectly overlap the spec keywords, the keyword component contributes 0.35 to the score.
5. When `matchContent()` is called against a skill index, skills with score >= 0.6 are classified as `'apply'`, 0.35-0.59 as `'reference'`, 0.15-0.34 as `'consider'`, and < 0.15 are excluded.
6. When a skill scores >= 0.35 and has `relatedSkills: ['other-skill']`, and `'other-skill'` is not already matched, the related skill appears in results with a boosted score of `parent_score * 0.6`.
7. When `generateSkillsMd()` is called with match results, it produces a markdown string with `## Apply`, `## Reference`, `## Consider` sections, each containing a table with Skill, Purpose, When, Relevance columns.
8. When `parseSkillsMd()` is called on the output of `generateSkillsMd()`, it returns the same structured match data (round-trip fidelity).
9. Each `SkillMatch` includes a `when` field with timing guidance (e.g., "During implementation", "After styling", "End of phase").
10. `npx vitest run packages/cli/tests/skill/signal-extractor.test.ts` passes.
11. `npx vitest run packages/cli/tests/skill/content-matcher.test.ts` passes.

## Uncertainties

- [ASSUMPTION] Spec frontmatter uses the `**Keywords:**` bold-keyword format (as seen in all existing specs), not YAML frontmatter.
- [ASSUMPTION] `extractSignals()` takes raw spec text (pure function) rather than file path. File I/O handled by callers in Phase 2.
- [ASSUMPTION] `detectStackFromDeps()` takes parsed dependency objects rather than reading `package.json` from disk.
- [DEFERRABLE] Exact stemming algorithm. Simple suffix-strip approach sufficient for v1.
- [ASSUMPTION] `featureDomain` categories are a fixed set: design, auth, data, security, a11y, perf, testing, api, infra, mobile.

## File Map

```
CREATE packages/cli/src/skill/content-matcher-types.ts
CREATE packages/cli/src/skill/signal-extractor.ts
CREATE packages/cli/src/skill/content-matcher.ts
CREATE packages/cli/src/skill/skills-md-writer.ts
CREATE packages/cli/tests/skill/signal-extractor.test.ts
CREATE packages/cli/tests/skill/content-matcher.test.ts
```

## Tasks

### Task 1: Define content matcher types

**Depends on:** none | **Files:** `packages/cli/src/skill/content-matcher-types.ts`

Create types file with: `ContentSignals`, `SkillMatchTier`, `SkillMatch` (including `when` field), `ContentMatchResult`, `TIER_THRESHOLDS`, `SCORING_WEIGHTS`.

### Task 2: Implement signal extractor with tests (TDD)

**Depends on:** Task 1 | **Files:** `signal-extractor.ts`, `signal-extractor.test.ts`

Implement: `simpleStem()`, `extractSpecKeywords()`, `detectStackFromDeps()`, `inferDomain()`, `extractSignals()`.

### Task 3: Implement content matcher with tests (TDD)

**Depends on:** Task 1 | **Files:** `content-matcher.ts`, `content-matcher.test.ts`

Implement: `computeKeywordOverlap()`, `computeStackMatch()`, `computeTermOverlap()`, `computeDomainMatch()`, `scoreSkillByContent()`, `classifyTier()`, `inferWhen()`, `inferCategory()`, `matchContent()`.

### Task 4: Implement SKILLS.md writer (in content-matcher.test.ts)

**Depends on:** Task 1 | **Files:** `skills-md-writer.ts`, tests appended to `content-matcher.test.ts`

Implement: `generateSkillsMd()` with Skill/Purpose/When/Relevance table columns, `parseSkillsMd()` for round-trip parsing.

### Task 5: Run all tests together

**Depends on:** Tasks 2, 3, 4 | Verification only.

### Task 6: End-to-end integration test

**Depends on:** Task 5 | Appended to `content-matcher.test.ts`.

Full pipeline: `extractSignals()` -> `matchContent()` -> `generateSkillsMd()` -> `parseSkillsMd()`.

### Task 7: Type check and full test suite

**Depends on:** Task 6 | Verification only.

[checkpoint:human-verify] -- Verify all tests pass before proceeding to Phase 2.
