# Plan — Extract `roadmap/heading.ts` (single source of truth for the H3 heading grammar)

Closes #1261.

## Problem

The roadmap H3 feature-heading grammar ("a feature heading, optionally escaped
with a `Feature: ` prefix") is encoded in three independent places that must
agree but nothing keeps in sync:

- `packages/core/src/roadmap/parse.ts` — `h3Pattern = /^### (Feature: )?(.+)$/gm`
  (requires exactly one space)
- `packages/core/src/roadmap/store/shard.ts` — `H3_NAME = /^###\s+(?:Feature:\s+)?(.+)$/m`
  (accepts `\s+`)
- `packages/core/src/roadmap/serialize.ts` — `serializeFeatureHeading()` (the emitter)

The whitespace difference is a latent divergence: `shard.ts` accepts heading
forms `parse.ts` rejects, so a shard hand-edited to `###  Feature:  x` reads
through the shard path but fails through the monolith path — silently
reclassifying tracked rows.

## Decision (human-confirmed)

Canonicalize on **lenient read, one-space emit**:

- The shared grammar ACCEPTS `\s+` on read (Postel's law — both current readers
  keep accepting what they accept today; `parse.ts` is widened to match
  `shard.ts`, never narrowed).
- `serializeFeatureHeading()` EMITS exactly one space.

This makes `serialize → parse` an identity and removes the divergence.

## Approach

Create `packages/core/src/roadmap/heading.ts` as the single source of truth:

- `GROUP_PREFIX` / `FEATURE_PREFIX` marker constants (moved here from `parse.ts`;
  they belong to the heading grammar).
- One canonical lenient pattern `^###\s+(Feature:\s+)?(.+)$` defined once.
- `serializeFeatureHeading(name)` — the emitter (moved from `serialize.ts`),
  one-space output, escaping any name that begins with either marker prefix.
- `parseFeatureHeading(line)` — single-line reader returning
  `{ name, explicitFeature } | null` (for the shard path).
- `matchFeatureHeadings(body)` — global multi-heading reader returning each
  heading's `{ name, explicitFeature, startIndex, fullMatch }` (for the monolith
  path, which needs positional slicing).

Keep the module a pure grammar helper — it must NOT reference the literal
roadmap-file name (repo invariant-R / roadmap-read-source).

## Files

- ADD `packages/core/src/roadmap/heading.ts`
- EDIT `packages/core/src/roadmap/parse.ts` — import prefixes + `matchFeatureHeadings`
  from `./heading`; delete the local `h3Pattern` loop and prefix constants; refresh
  the source-of-truth doc comment.
- EDIT `packages/core/src/roadmap/serialize.ts` — import `serializeFeatureHeading`
  from `./heading`; delete the local copy and the `./parse` prefix import.
- EDIT `packages/core/src/roadmap/store/shard.ts` — import `parseFeatureHeading`
  from `../heading`; delete the local `H3_NAME` regex.
- ADD `packages/core/tests/roadmap/heading.test.ts` — new grammar tests.

No new public `@harness-engineering/core` barrel export — `heading.ts` stays
internal to the roadmap module (imported by relative path only), so
`scripts/generate-core-barrel.mjs` needs no change.

## Test strategy

Keep the existing regression guards (`serialize-groups.test.ts`,
`groups-write-paths.test.ts`) untouched — they pin the whole seam over the shared
`MARKER_NAMES` list.

Add `heading.test.ts`:

1. The lenient form `###  Feature:  x` now parses to `{ name: 'x',
explicitFeature: true }` through **both** paths — `matchFeatureHeadings`
   (monolith) and `parseFeatureHeading` (shard) — proving the two readers agree.
2. A whole grouped-roadmap round-trip with a lenient hand-edited heading:
   `parseRoadmap` of a `###  Feature:  <marker-name>` monolith yields the correct
   feature, and `parseShard` of a lenient shard heading yields the same name.
3. `serialize → parse` identity: `serializeFeatureHeading(name)` for every
   `MARKER_NAMES` entry parses back via `parseFeatureHeading` to the same name
   with `explicitFeature` set, and emits exactly one space after `###`/`Feature:`.
4. Unit coverage of `serializeFeatureHeading` escaping and `matchFeatureHeadings`
   positional output.

Run: `pnpm --filter @harness-engineering/core test` plus typecheck, lint, build.
