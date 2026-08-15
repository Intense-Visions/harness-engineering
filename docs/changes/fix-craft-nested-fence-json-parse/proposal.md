# Fix: nesting-aware fenced-JSON parse stops dropping craft findings

Issue: #1369
Slug: `fix-craft-nested-fence-json-parse`

## Problem

Every craft family's CRITIQUE phase asks an LLM for a fenced JSON finding, then
extracts the JSON body before `JSON.parse`. Ten families
(`code / docs / spec / copy / naming / test / security / api / cli-ergonomics /
knowledge`) each carried a byte-identical **lazy** fence extractor:

````
/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
````

The `*?` (lazy) capture stops at the FIRST closing ` ``` `. When a
finding's `message` value itself contains a ` ``` ` fence — which happens
constantly, because critiques quote code blocks in their suggested revision —
the match truncates at that INNER fence. The captured body is an unterminated
JSON object, `JSON.parse` throws, `parseFencedJson` returns `null`, and the
finding is **silently dropped**. The reviewer sees a clean run and never learns
a real finding was lost.

## Goal

A finding whose `message` contains a ` ``` ` fence must be parsed, not
dropped — without merging two genuinely-separate fenced blocks (the failure
mode of a naive greedy "match to the last fence" fix).

## Design

Introduce ONE shared extractor and reuse it across all ten copies (all live in
`packages/cli`, so this is an internal module, not a new
`@harness-engineering/core` export — the core barrel allowlist is untouched):

- `packages/cli/src/shared/craft/fenced-json.ts` →
  `extractFencedJsonPayload(raw: string): string`

It is **nesting-aware** rather than regex-based:

1. Anchor on the opening fence (` ```json ` / ` ``` `) when present, so
   leading prose can't derail the scan; otherwise scan from the top so bare
   (unfenced) JSON still parses.
2. From there, perform a **string-and-escape-aware, brace-balanced scan** and
   return the FIRST complete JSON value (object or array).
   - Inner ` ``` ` fences live inside a JSON string (`"..."`), so they
     never affect brace balance → the full object is recovered (bug fixed).
   - The scan stops at the first balanced value, so two separate blocks are
     never merged — the second stays independently recoverable.
3. If the fenced region has no brace/bracket structure (e.g. the literal
   `null` sentinel), strip a trailing fence and return the trimmed remainder,
   preserving the existing `body === 'null'` / `body.trim() === 'null'` checks
   in every caller.

The function returns a string; each caller keeps ownership of `JSON.parse` +
`try/catch` and its own shape validation, matching the pre-existing contract.

## Acceptance criteria

- A fenced finding whose `message` contains a ` ``` ` fence parses to the
  full object (not dropped). _(covered)_
- Two separate fenced JSON blocks are not merged; the first parses and the
  second remains independently recoverable. _(covered)_
- A plain single fence still parses; bare JSON still parses; the `null`
  sentinel still returns `null`. _(covered)_
- Braces inside string values and escaped quotes do not confuse the scan.
  _(covered)_
- All ten craft families import the shared util; no duplicate lazy regex,
  `FENCED_JSON` const, or `stripJsonFence` helper remains.
- Full `@harness-engineering/cli` suite, typecheck, and lint stay green.

## Assumptions (defaults taken, per lane brief)

- Shared util placed in the cli package (`shared/craft/`), NOT added as a new
  core export — all consumers are in `packages/cli`, so no barrel-allowlist
  edit is required.
- Chose a brace-balanced scan over a greedy "last-fence" regex because greedy
  merges separate blocks (the failure the issue warns about).
- Scope limited to the ten families that carried the lazy regex; `design-craft`
  uses a different mechanism and was left untouched.
