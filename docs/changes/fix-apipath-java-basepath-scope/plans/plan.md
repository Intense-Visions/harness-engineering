# Plan: method-level @RequestMapping no longer overwrites Java basePath

**Issue:** #1367
**Spec:** ../proposal.md
**Owning package:** `@harness-engineering/graph`

## Tasks

### T1 — Regression test + fixture (TDD red)

- Add fixture `packages/graph/__fixtures__/extractor-project/RoutesMethodMapping.java`
  with a class-level `@RequestMapping("/api")` and a method-level
  `@RequestMapping("/foo")`.
- Add a test in `packages/graph/tests/ingest/extractors/ApiPathExtractor.test.ts`
  asserting the resolved record name is `ANY /api/foo` (and that neither `ANY /foo`
  nor `ANY /foo/foo` appears).
- Run test → expect RED (current heuristic yields `/foo/foo`).

### T2 — Implement target-declaration classification (green)

- In `extractJava`, add a helper `targetIsTypeDeclaration(lines, annotationLineIndex)`:
  scan forward from the annotation line, skip lines that are blank, line comments
  (`//`), or annotations (`@...`), stop at the first real declaration line, return
  whether it matches `/\b(class|interface|enum)\b/`.
- basePath loop: set `basePath` only when the `@RequestMapping` target is a type.
- endpoint loop: skip emitting a `@RequestMapping` whose target is a type
  (it is the class basePath, not an endpoint).
- Run test → expect GREEN. Confirm existing `Routes.java` Spring test still green.

### T3 — Validate + gates

- `pnpm turbo build --filter=@harness-engineering/graph`
- `pnpm --filter @harness-engineering/graph exec tsc --noEmit` (typecheck)
- Full `ApiPathExtractor.test.ts` suite green.
- Lint changed files.
- Add changeset (patch, `@harness-engineering/graph`), prettier --write changed files.

## Checkpoints

- After T1: reproducing test fails on current code (proves the bug).
- After T2: new test + all prior extractor tests pass.
- After T3: build/typecheck/lint clean, changeset present.

## Risks

- The class-level `@RequestMapping` re-matching the endpoint pattern (spurious record)
  — mitigated by the endpoint-loop skip. Verified by asserting record count/absence.
