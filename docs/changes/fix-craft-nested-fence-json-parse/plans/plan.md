# Plan: nesting-aware fenced-JSON parse (issue #1369)

Slug: `fix-craft-nested-fence-json-parse`
Spec: `../proposal.md`

## Task 1 — Author the shared extractor (TDD)

- Write `packages/cli/src/shared/craft/fenced-json.test.ts` covering: plain
  single fence, bare ` ``` ` fence, unfenced JSON, `null` sentinel, message
  containing an inner ` ``` ` fence (issue #1369 regression), inner fence
  with a `json` info-string, two separate blocks not merged, braces inside
  strings, escaped quotes, top-level array.
- Implement `packages/cli/src/shared/craft/fenced-json.ts` exporting
  `extractFencedJsonPayload(raw)`: anchor on opening fence, then a
  string/escape-aware brace-balanced scan returning the first complete JSON
  value; fall back to fence-strip for the `null` literal.
- Gate: `vitest run src/shared/craft/fenced-json.test.ts` green.

## Task 2 — Rewire all ten craft families

For each of `code / docs / spec / copy / naming / test / security / api /
cli-ergonomics / knowledge` `phases/critique.ts`:

- Add `import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';`
  (naming-craft imports the util from the same shared path even though its
  other imports are local).
- Replace the inline lazy-regex extraction (or the hoisted `FENCED_JSON` const /
  docs-craft's `stripJsonFence` helper) with
  `const body = extractFencedJsonPayload(raw);`.
- Delete the now-dead `FENCED_JSON` consts (api, code) and `stripJsonFence`
  helper (docs) so no duplicate extractor remains.
- Preserve each caller's existing `null` check and shape validation.

## Task 3 — Validate

- `pnpm turbo build --filter=@harness-engineering/cli` (bundles + DTS typecheck).
- Full `@harness-engineering/cli` vitest suite green (no regressions).
- ESLint clean on all changed files.
- Confirm: 10 imports of the shared util, zero remaining lazy regex /
  `FENCED_JSON` / `stripJsonFence`.

## Task 4 — Ship

- Changeset (patch bump, `@harness-engineering/cli`).
- `prettier --write` changed files.
- Commit, push (non-`.claude` worktree), open PR `Closes #1369`.
