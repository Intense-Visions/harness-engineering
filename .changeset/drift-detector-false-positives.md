---
'@harness-engineering/core': patch
---

fix(entropy): stop the doc-drift detector flooding docs-heavy repos with false positives (#816)

`harness cleanup --type drift` (and the `detect-doc-drift` skill) treated every
backtick-quoted markdown token as a reference to a top-level TypeScript export,
producing ~100% false positives on prose- and spec-heavy repos — 36,697
findings on this repo alone, essentially all noise, which buried real drift and
made the `harness-docs-pipeline` DETECT phase unusable.

Reference extraction and resolution are now discriminating:

- **Extraction requires a code signal.** A backtick token is only kept when its
  base identifier segment carries a structural marker (uppercase, digit, or
  underscore) or it is written as a call (`foo()`). Bare prose words (`done`,
  `local`, `grep`) and lowercase-headed code-example fragments (`db.query`,
  `hooks.afterCreate`) are dropped. The non-TS source-file extension list is
  expanded (`.py`, `.rs`, `.go`, …) so cited files from other languages are not
  mistaken for symbols. This stays language-agnostic: `snake_case` and
  `SCREAMING_SNAKE` tokens are kept because they are real symbols in
  Python/Rust/Go.
- **Change specs are forward-looking.** `docs/changes/**` (proposals and phase
  plans that describe proposed/illustrative code) join
  `docs/architecture|decisions|proposals|adr` in the default forward-looking
  suppression set.
- **Dotted references resolve by their head.** `User.email` is validated
  against `User` (the only symbol the export map actually tracks) instead of the
  full dotted path, so genuine member accesses are no longer flagged.
- **Convention suppression is language-aware.** `snake_case` / `SCREAMING_SNAKE`
  doc tokens are suppressed only when the codebase exports nothing of that
  convention — a TS project (no snake_case exports) stops flagging MCP tool
  names and config keys, while a Python/Rust/Go project keeps flagging genuinely
  removed snake_case symbols.

On this repo the detector drops from 36,697 to ~2,600 findings (94% fewer
api-signature findings) with zero regressions to the existing #492 and #723
multi-language coverage. The residual (camelCase parameter names, env vars,
broken links) is the class that only graph `documents`-edge detection can fully
resolve, tracked separately.
