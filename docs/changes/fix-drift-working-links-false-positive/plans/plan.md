# Implementation Plan: Fix drift working-link false positives (#1342)

Spec: `docs/changes/fix-drift-working-links-false-positive/proposal.md`
Target file: `packages/core/src/entropy/detectors/drift.ts`
Tests: `packages/core/tests/entropy/detectors/drift.test.ts`

## Task 1 — TDD: add failing unit tests (RED)

Extend the existing `drift detector — issue #1342/#1332 regressions` describe
block with cases:

- `## 📖 Usage` heading + link `#-usage` → 0 structure drifts.
- `## Café` heading + link `#café` → 0 structure drifts.
- Nested 4-tick fence wrapping a 3-tick fence, with a broken-looking link in the
  second half of the quoted region → 0 structure drifts (inner half not exposed).
- `# Title` heading inside a fenced block → an anchor link `#title` to the OUTER
  file is flagged (in-fence heading is NOT a real anchor).
- Duplicate `## Setup` headings; link to `#setup-1` → 0 structure drifts.

Verify these FAIL against current code before implementing.

## Task 2 — Fix `slugifyHeading` (GREEN part 1)

Replace body with:

```ts
return text
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s_-]/gu, '')
  .replace(/\s/g, '-');
```

Update the JSDoc to note Unicode-aware, no-trim semantics.

## Task 3 — Add nesting-aware `blankFencedRegions` and route both call sites

- Add module-private `blankFencedRegions(content: string): string`:
  - Split into lines; track `fence: { char, len } | null`.
  - Open on `^\s*(`{3,}|~{3,})` when closed; record char + run length; blank line.
  - When open, close only on same-char run `>= len` with whitespace-only trailer;
    otherwise blank the line. Blank the closer too.
  - Join with `\n` (line count preserved).
- `extractFileLinks`: strip via `blankFencedRegions` up front; remove
  `inFencedCodeBlock` toggle and the fence-line `continue`.
- `extractHeadingSlugs`: strip via `blankFencedRegions` before the heading regex.

## Task 4 — Duplicate-heading dedup in `extractHeadingSlugs` (GREEN part 2)

Track `const seen = new Map<string, number>()`; for each heading compute
`base = slugifyHeading(...)`, `count = seen.get(base) ?? 0`, `seen.set(base, count+1)`,
add `count === 0 ? base : \`${base}-${count}\``.

## Task 5 — Verify

- `pnpm vitest run tests/entropy/detectors/drift.test.ts` (all green: new + #1363
  - #492 + #816 regressions).
- `pnpm turbo build --filter=@harness-engineering/core`, typecheck, lint.
- Add changeset (patch, `@harness-engineering/core`), prettier --write changed files.

## Checkpoints

- After Task 1: tests RED (confirm reproduction).
- After Task 4: tests GREEN.
- After Task 5: build/typecheck/lint green; ready to commit.
