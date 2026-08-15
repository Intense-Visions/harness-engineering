# Fix: checkStructureDrift reports working links as drift (slug + nested-fence)

**Keywords:** entropy, drift, structure-drift, slugify, gfm-anchor, fenced-code, unicode-slug, heading-dedup

**Issue:** #1342

## Overview and Goals

`checkStructureDrift` in `packages/core/src/entropy/detectors/drift.ts` reports
working documentation links as drift. On one consumer repo (canary) these
account for 27 of 27 structural drift findings — a 100% false-positive rate that
makes the check unable to surface a genuinely dead link.

A prior partial fix (PR #1363) added fence-awareness to `extractFileLinks` and
`&`-heading handling to `slugifyHeading`. **Those gains must not regress.** Two
defects remain live:

1. **`slugifyHeading` slugs incorrectly.** It calls `.trim()` _before_ converting
   whitespace to hyphens, so `## 📖 Usage` slugs to `usage` where GitHub emits
   `-usage` (GitHub keeps the space the emoji left behind). It also uses `\w`
   (ASCII-only), so `## Café` slugs to `caf` where GitHub keeps `café`.
2. **Fence handling is not nesting-aware.** `extractFileLinks` uses a naive
   open/close backtick toggle, so a 4-tick ` ` ``region wrapping a
3-tick` ` ` region re-toggles on the inner fence and exposes the second
   half of the quoted document. Separately, `extractHeadingSlugs` reads headings
   that live _inside_ fenced blocks (a `# Title` in a quoted example registers as
   a real anchor) and does not disambiguate duplicate headings the way GitHub
   does (`## Setup` twice → `#setup`, `#setup-1`).

Goal: `checkStructureDrift` matches GitHub's anchor semantics for emoji/accented/
duplicate headings and treats nested fences correctly, while preserving the
#1363 fence-awareness and `&`-heading behavior.

## Decisions Made

- **Fix `slugifyHeading` per the issue's recommended default.** Drop the
  `.trim()`; map each whitespace character to one hyphen (`/\s/g`, already the
  case post-#1363); replace the ASCII `\w` class with Unicode `\p{L}\p{N}` plus
  an explicit `_` and `-` (the `u` flag). Rationale: mirrors GitHub's GFM slugger
  for the common hand-written-anchor case, which is what the check validates
  against. (Assumption A1)
- **Introduce a single nesting-aware fence-stripping helper.** A shared
  `blankFencedRegions(content)` blanks every line inside a fenced region
  (preserving line numbers so link line reporting stays correct) and requires a
  fence CLOSE to be the _same_ fence character with a run length `>=` the
  opener's, with no info string — matching CommonMark/GFM. Both `extractFileLinks`
  and `extractHeadingSlugs` route content through it, replacing the ad-hoc toggle.
  Rationale: one correct implementation shared by both call sites avoids the two
  detectors drifting apart. (Assumption A2)
- **Dedup duplicate headings GitHub-style.** In `extractHeadingSlugs`, track base
  slug counts; the Nth (N>1) occurrence of a base slug anchors at `base-{N-1}`.
  (Assumption A3)

## Technical Design

`packages/core/src/entropy/detectors/drift.ts`:

- `slugifyHeading(text)`:
  ```ts
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
  ```
- New `blankFencedRegions(content: string): string` — line-by-line; tracks an
  open fence `{ char, len }`; opens on `^\s*(`{3,}|~{3,})`; closes only on a bare
same-char run `>= len` with whitespace-only trailer; blanks opener, body, and
  closer lines (line count preserved).
- `extractFileLinks(content)` — pre-pass `content` through `blankFencedRegions`,
  drop the local `inFencedCodeBlock` toggle; iterate the blanked lines.
- `extractHeadingSlugs(filePath)` — pre-pass file content through
  `blankFencedRegions`; run the existing heading regex over the blanked content;
  dedup via a `Map<string, number>` of base-slug counts.

## Integration Points

- **Entry Points:** None new — internal helpers of the existing structure-drift
  detector reached via `detectDocDrift` / `checkStructureDrift`.
- **Registrations Required:** None (no new exports; `blankFencedRegions` is
  module-private).
- **Documentation Updates:** None (no CLI/command surface change).
- **Architectural Decisions:** None (small change, < 3 files).
- **Knowledge Impact:** None.

## Success Criteria

1. `## 📖 Usage` slugs to `-usage`; a link to `#-usage` is not flagged.
2. `## Café` slugs to `café`; a link to `#café` is not flagged.
3. A 3-tick fence wrapped in a 4-tick fence does not expose the inner half — a
   link in the second half of the quoted region is not flagged.
4. A heading inside a fenced block does not register as a real anchor.
5. Duplicate headings dedup: second `## Setup` anchors at `#setup-1`.
6. All pre-existing #1363 behavior (fence-awareness, `## Tips & Tricks` →
   `tips--tricks`) still passes.
7. Build, typecheck, lint, and the drift detector's vitest suite are green.

## Implementation Order

1. TDD: add failing unit tests for criteria 1–5 (emoji, accented, nested fence,
   in-fence heading, duplicate headings).
2. Implement `slugifyHeading` fix, `blankFencedRegions`, and route both call
   sites through it; add dedup.
3. Verify all drift tests (new + #1363 + #492 + #816) green; build/typecheck/lint.
