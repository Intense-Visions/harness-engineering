# Plan: outcome-eval Phase 2 — Section Resolver

**Date:** 2026-06-22 | **Spec:** `docs/changes/outcome-eval/proposal.md` (Implementation Order, Phase 2) | **Tasks:** 4 | **Time:** ~15 min | **Integration Tier:** small

## Goal

Implement `packages/intelligence/src/outcome-eval/section-resolver.ts`: parse spec markdown and resolve the judgment section via the fallback chain `## Success Criteria` → `## User-Visible Behavior` → `## Overview`, returning the matched section body plus which heading matched (`JudgedAgainst`), and signal cleanly when no judgable section exists.

## Scope (this phase only)

In scope: the pure section-resolver function + its tests + barrel exports. Satisfies **Success Criterion 5**.

Out of scope (later phases, do NOT build here): the `OutcomeEvaluator`, prompts beyond what exists, the INCONCLUSIVE mapping itself (Phase 3), graph persistence (Phase 4). This phase only produces the "no judgable section found" _signal_ that a later phase maps to INCONCLUSIVE.

## Observable Truths (Acceptance Criteria)

1. `resolveSection(md)` for markdown containing `## Success Criteria` returns `{ judgedAgainst: 'success-criteria', body: <that section's body> }`. (event-driven: when a spec has a Success Criteria heading, the resolver shall return it.)
2. When a spec has **no** Success Criteria heading but has `## User-Visible Behavior`, the resolver shall return `judgedAgainst: 'user-visible-behavior'`.
3. When a spec has only `## Overview`, the resolver shall return `judgedAgainst: 'overview'`.
4. **Fallback ordering:** when a spec contains BOTH `## Success Criteria` and `## Overview`, the resolver shall return `success-criteria` (higher-priority heading wins regardless of document order). Likewise `user-visible-behavior` wins over `overview`.
5. **Case-insensitivity:** `## Success criteria` (sentence case, as in the real spec line 199) and `## SUCCESS CRITERIA` both resolve to `success-criteria`. Heading whitespace is trimmed before matching.
6. The returned `body` contains the section content up to (and excluding) the next `##`-level (or higher) heading, with surrounding blank lines trimmed; it excludes the heading line itself.
7. **No judgable section:** when none of the three headings is present, the resolver shall return a clear, typed "not found" signal (`null`) — never throw — that a later phase maps to INCONCLUSIVE.
8. `resolveSection` and its result type are exported from `packages/intelligence/src/outcome-eval/index.ts` and re-exported from `packages/intelligence/src/index.ts`. The result type reuses `JudgedAgainst` from `types.ts` (not redefined).
9. `harness validate` introduces no new layer/import violations in `packages/intelligence/src/outcome-eval/`; the module imports only from within `outcome-eval` (zero cross-package imports).

## File Map

- CREATE `packages/intelligence/src/outcome-eval/section-resolver.ts`
- CREATE `packages/intelligence/tests/outcome-eval/section-resolver.test.ts`
- MODIFY `packages/intelligence/src/outcome-eval/index.ts` (add export)
- MODIFY `packages/intelligence/src/index.ts` (add re-export)

## Evidence (grounding)

- `JudgedAgainst` type exists at `packages/intelligence/src/outcome-eval/types.ts:13` — reuse, do not redefine.
- Module barrel pattern at `packages/intelligence/src/outcome-eval/index.ts` (named value + `export type`).
- Package barrel re-export pattern at `packages/intelligence/src/index.ts:56-66`.
- Test conventions: `import { describe, it, expect } from 'vitest'`; relative `../../src/.../*.js` import specifiers; see `packages/intelligence/tests/outcome-eval/schema.test.ts:1-2`, `authority.test.ts:1-3`.
- Layer rule: `packages/intelligence/package.json` declares deps only on `@harness-engineering/graph`, `@harness-engineering/types`, `zod`, openai/anthropic SDKs. `packages/core/src/context/section-parser.ts` exists but is in the `core` package — **must not be imported** (task constraint: intelligence → types, graph only). The resolver is pure string parsing and needs no external module.
- Real-world heading variance (grep over `docs/changes/*/proposal.md`): `## Success Criteria` (158, title case) vs the spec's own `## Success criteria` (sentence case, line 199) — confirms case-insensitive matching is required.

## Skeleton

_Not produced — task count (4) is below the standard-mode threshold (8). Proceeding to full tasks._

## Uncertainties

- [ASSUMPTION] Headings to match are `##` (h2) level, consistent with the real spec. The matcher will accept `##`+ but anchor on the heading text; nested headings inside a section (deeper `###`) do not terminate the body. (If specs ever use `#`-level acceptance headings this needs revision — not observed in any current spec.)
- [ASSUMPTION] "User-Visible Behavior" is matched as a heading whose normalized text equals `user-visible behavior` (hyphen or space tolerated). Rare in practice (spec line 53 notes it is rare) but required by the chain.
- [DEFERRABLE] Whether the body should strip trailing reference/footnote lines — not required by Criterion 5; left as raw trimmed body for Phase 3 to consume.

## Tasks

### Task 1: Write failing tests for `resolveSection` (TDD red)

**Depends on:** none | **Files:** `packages/intelligence/tests/outcome-eval/section-resolver.test.ts`

1. Create `packages/intelligence/tests/outcome-eval/section-resolver.test.ts` with exact content:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSection } from '../../src/outcome-eval/section-resolver.js';
import type { JudgedAgainst } from '../../src/outcome-eval/types.js';

const wrap = (heading: string, body: string) =>
  `# Title\n\nintro\n\n${heading}\n\n${body}\n\n## Next\n\nafter\n`;

describe('resolveSection', () => {
  it('matches ## Success Criteria and returns success-criteria (Criterion 5)', () => {
    const r = resolveSection(wrap('## Success Criteria', '1. does the thing'));
    expect(r).not.toBeNull();
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('does the thing');
    expect(r!.body).not.toContain('Success Criteria'); // heading excluded
    expect(r!.body).not.toContain('after'); // stops at next heading
  });

  it('falls back to user-visible-behavior when Success Criteria is absent', () => {
    const r = resolveSection(wrap('## User-Visible Behavior', 'user sees X'));
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('user-visible-behavior');
    expect(r!.body).toContain('user sees X');
  });

  it('falls back to overview when only Overview is present', () => {
    const r = resolveSection(wrap('## Overview', 'what it does'));
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('overview');
    expect(r!.body).toContain('what it does');
  });

  it('prefers success-criteria over overview regardless of document order (Criterion 5)', () => {
    const md = '## Overview\n\nthe overview body\n\n## Success Criteria\n\nthe sc body\n';
    const r = resolveSection(md);
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('the sc body');
    expect(r!.body).not.toContain('the overview body');
  });

  it('prefers user-visible-behavior over overview', () => {
    const md = '## Overview\n\nov\n\n## User-Visible Behavior\n\nuvb body\n';
    expect(resolveSection(md)!.judgedAgainst).toBe<JudgedAgainst>('user-visible-behavior');
  });

  it('is case-insensitive: ## Success criteria resolves to success-criteria (real-spec sentence case)', () => {
    expect(resolveSection('## Success criteria\n\nbody\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'success-criteria'
    );
  });

  it('is case-insensitive: ## SUCCESS CRITERIA resolves to success-criteria', () => {
    expect(resolveSection('## SUCCESS CRITERIA\n\nbody\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'success-criteria'
    );
  });

  it('tolerates a space instead of a hyphen in User-Visible Behavior', () => {
    expect(resolveSection('## User Visible Behavior\n\nb\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'user-visible-behavior'
    );
  });

  it('returns null when no judgable section is present (Criterion 5 / no-section case)', () => {
    const md = '# Title\n\n## Technical Design\n\nstuff\n\n## Decisions\n\nmore\n';
    expect(resolveSection(md)).toBeNull();
  });

  it('does not throw on empty input; returns null', () => {
    expect(resolveSection('')).toBeNull();
  });

  it('trims surrounding blank lines from the body', () => {
    const r = resolveSection('## Overview\n\n\n  content here  \n\n\n## Next\n\nx\n');
    expect(r!.body).toBe('content here');
  });
});
```

2. Run: `pnpm --filter @harness-engineering/intelligence test -- section-resolver` — observe failure (module does not exist).
3. No commit yet (red step paired with Task 2).

### Task 2: Implement `resolveSection` (TDD green) and commit

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/outcome-eval/section-resolver.ts`

1. Create `packages/intelligence/src/outcome-eval/section-resolver.ts` with exact content:

```ts
import type { JudgedAgainst } from './types.js';

/**
 * Result of resolving the judgment section from a spec's markdown.
 * `body` is the matched section's content (heading excluded, blank-trimmed).
 */
export interface ResolvedSection {
  judgedAgainst: JudgedAgainst;
  body: string;
}

/**
 * Fallback chain, highest priority first. Each entry pairs the JudgedAgainst
 * tag with a predicate over the NORMALIZED heading text (lowercased, trimmed,
 * hyphens collapsed to spaces) so matching is case- and hyphen-insensitive.
 */
const CHAIN: ReadonlyArray<{ tag: JudgedAgainst; matches: (normalized: string) => boolean }> = [
  { tag: 'success-criteria', matches: (h) => h === 'success criteria' },
  { tag: 'user-visible-behavior', matches: (h) => h === 'user visible behavior' },
  { tag: 'overview', matches: (h) => h === 'overview' },
];

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

const normalizeHeading = (text: string): string =>
  text.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Resolve the judgment input from a spec's markdown via the fallback chain
 * Success Criteria -> User-Visible Behavior -> Overview, returning the matched
 * section body plus which heading matched.
 *
 * Returns `null` when no judgable section exists. The caller (a later phase)
 * maps that null to an INCONCLUSIVE verdict — this resolver never throws and
 * never decides verdict authority.
 *
 * Self-contained string parsing: imports only the JudgedAgainst type, honoring
 * the intelligence layer rule (no `core` dependency).
 */
export function resolveSection(markdown: string): ResolvedSection | null {
  const lines = markdown.split(/\r?\n/);

  // Index every heading once: { lineIndex, level, tag|null }.
  const headings = lines
    .map((line, index) => {
      const m = HEADING_RE.exec(line);
      if (!m) return null;
      const level = m[1].length;
      const normalized = normalizeHeading(m[2]);
      const entry = CHAIN.find((c) => c.matches(normalized));
      return { index, level, tag: entry ? entry.tag : null };
    })
    .filter((h): h is { index: number; level: number; tag: JudgedAgainst | null } => h !== null);

  for (const { tag } of CHAIN) {
    const start = headings.find((h) => h.tag === tag);
    if (!start) continue;

    // Body runs from the line after the heading to the next heading of the
    // same-or-shallower level (deeper sub-headings stay inside the body).
    const next = headings.find((h) => h.index > start.index && h.level <= start.level);
    const endExclusive = next ? next.index : lines.length;
    const body = lines
      .slice(start.index + 1, endExclusive)
      .join('\n')
      .trim();
    return { judgedAgainst: tag, body };
  }

  return null;
}
```

2. Run: `pnpm --filter @harness-engineering/intelligence test -- section-resolver` — observe all tests pass.
3. Run: `harness validate`
4. Commit: `feat(outcome-eval): add spec section resolver with fallback chain`

### Task 3: Export from the module barrel and package barrel

**Depends on:** Task 2 | **Files:** `packages/intelligence/src/outcome-eval/index.ts`, `packages/intelligence/src/index.ts`

1. In `packages/intelligence/src/outcome-eval/index.ts`, append:

```ts
export { resolveSection } from './section-resolver.js';
export type { ResolvedSection } from './section-resolver.js';
```

2. In `packages/intelligence/src/index.ts`, extend the existing outcome-eval block: add `resolveSection` to the value export and `ResolvedSection` to the type export from `'./outcome-eval/index.js'`. (Add `resolveSection` to the `export { deriveAuthority, verdictSchema, ... }` line; add `ResolvedSection` to the `export type { ... }` list.)
3. Run: `pnpm --filter @harness-engineering/intelligence build` — observe it compiles (verifies barrel wiring + types resolve).
4. Run: `harness validate`
5. Commit: `feat(outcome-eval): export resolveSection from barrels`

### Task 4: Verify full module test pass and no new layer violations

**Depends on:** Task 3 | **Files:** none (verification only)

1. Run: `pnpm --filter @harness-engineering/intelligence test -- outcome-eval` — observe authority, schema, and section-resolver suites all pass.
2. Run: `harness check-deps` — confirm no NEW circular/layer issue is reported for `packages/intelligence/src/outcome-eval/` (pre-existing cli/graph issues are out of scope; compare against the baseline noted in Concerns).
3. Run: `harness validate`
4. No commit (verification gate). If any check regresses, return to the relevant task.

## Concerns / Pre-existing Noise (not introduced by this phase)

- `harness validate` reports design-token findings in `packages/graph/tests/**` and `packages/orchestrator/**` (hardcoded colors / fonts in test fixtures). Pre-existing, unrelated to outcome-eval.
- `harness check-deps` reports two pre-existing circular deps in `packages/cli/src/drift/**` and `packages/cli/src/shared/craft/llm/**`. Unrelated to outcome-eval. Use these as the baseline when verifying Task 4 introduces nothing new.
- The harness config (`harness.config.json:38`) lists `core` in intelligence's `allowedDependencies`, but `packages/intelligence/package.json` does not declare a `core` dependency and the phase constraint is "types, graph only." The resolver is therefore self-contained (zero cross-package imports), satisfying both.
