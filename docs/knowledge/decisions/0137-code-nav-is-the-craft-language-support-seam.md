---
number: 0137
title: Craft unit extraction routes through code-nav, making it the craft family's single language-support seam
date: 2026-11-13
status: accepted
tier: medium
source: docs/changes/auto-wire-craft-at-review/proposal.md
---

## Context

Craft reached for the TypeScript Compiler API directly, so every craft domain was a
TypeScript-only critic in a product whose parsing stack already shipped six languages:
`SupportedLanguage` is `typescript | javascript | python | go | rust | java`
(`packages/core/src/code-nav/types.ts:4`). Auto-wiring craft at the review moment made that
anomaly load-bearing. A domain that cannot read the changed files returns an empty finding
set, and an empty finding set is indistinguishable from "this code is fine" — the exact
silent-zero shape this feature exists to remove. Five of six languages would have gone quiet.

The alternative was to widen craft's own TS-Compiler-API extractor per language. That means
craft owning a parser per language, duplicating what `code-nav` already does, and diverging
from `code_outline` / `code_search` / `code_unfold` on what a "unit" is.

Routing through `code-nav` also surfaced two defects one layer BELOW where the spec had placed
its guards, which is itself an argument for the seam: no `packages/cli` adapter could have
compensated, because the node was already gone before `getOutline` returned. Every decorated
Python definition was dropped (tree-sitter wraps a decorated `def`/`class` in
`decorated_definition`, while `TOP_LEVEL_TYPES.python` keyed on `function_definition`, now a
grandchild) — a Flask module whose handlers are all `@app.route`-decorated extracted ZERO
units and reported a clean pass. And a Rust `mod` body was never walked. Both are fixed, and
the fixes benefit `code_outline` and `code_search` as well, which a craft-local parser would
not have.

## Decision

`code-nav` is the craft family's single language-support seam. The shared extraction path
(`packages/cli/src/shared/craft/extract/outline-units.ts`) routes a craft domain through
`code-nav`'s outline when `detectLanguage(file)` is one of the four non-TS/JS languages listed
in `OUTLINE_LANGUAGES` (`:45`), and a new language is added by teaching `code-nav`, not by
teaching craft.

The seam is not free and the record states its two known edges rather than implying parity
with the TypeScript extractor:

- There is no substantiveness filter outside TypeScript. The TS extractor bars
  sub-three-statement bodies; the outline exposes no statement count. The shared seam uses a
  line-span proxy (`MIN_UNIT_LINES`), which is a proxy and not an equivalent — it diverges from
  the TS rule in BOTH directions, and `outline-units.ts` records the measured divergence at the
  constant rather than claiming equivalence.
- Not every craft domain is a seam adopter. `security-craft` does NOT extract units: its
  `detectSignals` matches CALL EXPRESSIONS while `extractSymbols` walks only declaration
  types, so routing it through the outline yields zero signals per non-TS file — and its
  zero-signal path is SKIP, i.e. a confident clean security report for a Python file. Real
  support means per-language signal catalogs plus a call-site walk, which is why 2c is a
  separate piece of work and why `security-craft` narrowed its declared languages to
  `['typescript','javascript']` rather than claiming six.

Declared capability must track actual capability: a domain declares only the languages it can
genuinely extract from, and a law derived from `EXTENSION_MAP` pins the TS/JS extension set.
After 2a only `code-craft` is genuinely multi-language, so `naming-craft`, `security-craft`
and `test-craft` narrowed their declarations. An honest narrow declaration is the point; an
optimistic wide one reintroduces the silent zero this seam exists to remove.

## Consequences

- A seventh language added to `code-nav`'s `EXTENSION_MAP` reaches every seam-adopting craft
  domain at once, instead of six separate parser additions.
- The granularity mismatch is now the known weak point and is recorded as a follow-up rather
  than claimed as solved: `CraftDomainRule.supportedLanguages` is per-LANGUAGE while
  extraction is gated per EXTENSION, so a seventh language would be auto-declared by
  `ALL_SOURCE_LANGUAGES` (`packages/core/src/hooks/craft-review-hooks.ts:265`) and extract
  nothing, and the subset law compares at language granularity so it would not catch that.
  Deriving `OUTLINE_LANGUAGES` (`packages/cli/src/shared/craft/extract/outline-units.ts:45`)
  from `ALL_SOURCE_LANGUAGES` closes it; Phases 3 and 4 both recommended it.
- `code_unfold` sees strictly more symbols, but it is not a pure gain and the change log says
  so: lookup is first-match-wins over the outline, so in a Rust file where a `mod`-nested name
  shadows a top-level one, `code_unfold` now resolves to whichever is EARLIER IN THE FILE.
  That resolution rule is pinned by a test rather than left incidental.
- Craft inherits `code-nav`'s blind spots. Python nested classes (`class Meta`, `class
Config`), Java inner and static nested classes (the whole Builder pattern), and Python
  definitions under `if TYPE_CHECKING:` are all invisible today — the last producing zero
  symbols with NO error. They are recorded as FU-1, FU-2 and FU-3 in the spec's deferred list.

## References

- `docs/changes/auto-wire-craft-at-review/proposal.md` — the spec (D9, and the deferred list
  carrying FU-1 through FU-5).
- `packages/cli/src/shared/craft/extract/outline-units.ts` — the seam: `OUTLINE_LANGUAGES`
  (`:45`), `MIN_UNIT_LINES` (`:84`) and its measured divergence note, `usesOutlineExtraction`,
  `extractOutlineUnits`.
- `packages/core/src/code-nav/types.ts:4` — `SupportedLanguage`, the six languages the seam
  inherits.
- `packages/core/src/hooks/craft-review-hooks.ts` — `ALL_SOURCE_LANGUAGES` (`:265`) and the
  per-domain `supportedLanguages` declarations (`:304` onward).
- ADR 0136 — the resolver this seam feeds, and the advisory contract that makes a skipped
  language a reported skip rather than a silent clean pass.
