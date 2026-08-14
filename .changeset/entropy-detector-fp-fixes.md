---
'@harness-engineering/core': patch
---

fix(entropy): correct detector false positives and a corrupt complexity metric

- `findFunctionEnd` (complexity detector) no longer runs its brace scan into the
  next function or to end-of-file for an expression-bodied arrow or a bodyless
  declaration; the statement now closes on its own line, so function length,
  cyclomatic complexity, and nesting are attributed correctly (#1329).
- The drift detector's structure-link extractor now tracks fenced code blocks
  (``` and ~~~) and ignores links written inside them, so documentation examples
  are not reported as broken references (#1342, #1332).
- `slugifyHeading` now emits one hyphen per whitespace character (matching
  GitHub) instead of collapsing runs, so anchors for headings such as
  "Tips & Tricks" (`tips--tricks`) are validated correctly and no longer flagged.
