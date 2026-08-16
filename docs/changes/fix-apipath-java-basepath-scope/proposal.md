# Fix: method-level @RequestMapping no longer overwrites Java basePath

**Issue:** #1367
**Keywords:** api-path-extractor, java, spring, RequestMapping, basePath, code-graph, ingest

> Autonomous fleet lane. No human sign-off is available in this context; the recommended defaults from the issue are taken and recorded as assumptions below.

## Overview and Goals

`ApiPathExtractor.extractJava` derives a file-wide `basePath` from the class-level
`@RequestMapping(...)` annotation and prefixes it onto every method endpoint. The
current heuristic sets `basePath` for **any** `@RequestMapping(...)` line where the
same line lacks the `class` keyword. In idiomatic Spring code the annotation always
sits on its own line above the declaration, so a **method-level** `@RequestMapping`
(which also lacks `class` on its line) wrongly overwrites the class-level basePath.

Goal: `basePath` must come only from a **class/interface/enum-level**
`@RequestMapping`. A method-level `@RequestMapping` must contribute the **method**
path (prefixed by the class basePath), not replace basePath.

## Problem Boundary

- **In scope:** the `basePath` selection loop in `extractJava` (single file,
  `packages/graph/src/ingest/extractors/ApiPathExtractor.ts`), plus a regression test
  and a fixture.
- **Out of scope:** other languages/frameworks, multi-`@RequestMapping` merge
  semantics, method-name-array path forms, non-string annotation attributes.

## Decisions Made

| Decision                                                                                                                                                                                        | Rationale                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classify each `@RequestMapping` by its **target declaration** (the next non-annotation, non-blank, non-comment line): only set `basePath` when that target contains `class`/`interface`/`enum`. | Directly matches Java semantics — a class-level annotation annotates a type declaration; a method-level one annotates a method. Replaces the brittle "this line lacks `class`" heuristic. (Recommended default from issue #1367.) |
| A class-level `@RequestMapping` used as basePath is **not** additionally emitted as an endpoint.                                                                                                | Prevents a spurious `ANY /api/api` record (the class annotation would otherwise re-match the endpoint pattern and be prefixed by its own basePath). Preserves the existing fixture's record set.                                  |
| Preserve existing `Routes.java` fixture behavior; add a new fixture for the method-level case.                                                                                                  | Keeps the current Spring test green while adding the regression coverage the issue requires.                                                                                                                                      |

## Technical Design

Add a small helper that, from a `@RequestMapping` line index, finds the target
declaration line by scanning forward past annotation lines (`@...`), blank lines, and
line comments, then reports whether that declaration is a **type** (matches
`\b(class|interface|enum)\b`).

- **basePath loop:** set `basePath` only when the `@RequestMapping` target is a type.
- **endpoint loop:** when a matched annotation is a class-level `@RequestMapping`
  (target is a type), skip emitting it as an endpoint; otherwise emit as today with
  the resolved `basePath + path`.

Resolved path for a class `@RequestMapping("/api")` + method `@RequestMapping("/foo")`
becomes `/api/foo` (method `ANY`).

## Integration Points

- **Entry Points:** none new — internal behavior of the existing `api-paths`
  extractor consumed by graph ingest.
- **Registrations Required:** none — no new exports, tools, or routes.
- **Documentation Updates:** None (small internal bug fix).
- **Architectural Decisions:** None.
- **Knowledge Impact:** None.

## Success Criteria

1. Class-level `@RequestMapping("/api")` + method-level `@RequestMapping("/foo")`
   resolves to `/api/foo` (not `/foo` and not `/foo/foo`). (New regression test.)
2. Existing `Routes.java` Spring test stays green (endpoints resolve under `/api`).
3. No spurious endpoint record is emitted for the class-level `@RequestMapping`.
4. `@harness-engineering/graph` builds, typechecks, lints, and all
   `ApiPathExtractor` tests pass.

## Implementation Order

1. TDD: add regression test + fixture for the method-level `@RequestMapping` case (red).
2. Implement target-declaration classification in `extractJava` (green).
3. Build, typecheck, lint, run full extractor suite.
