# Roadmap thematic grouping / free-form narrative sections

> Spec tracks GitHub issue #972 (external feature request). Shipped artifacts
> (parser errors, docs, changeset) carry no issue/PR numbers.

## Overview and goals

The roadmap parser (`packages/core/src/roadmap/parse.ts` — `parseFeatures` +
`validateStatus`) treats **every** `### H3` inside a milestone as a feature that
must carry a valid `- **Status:** <status>` bullet. A roadmap that uses some
`### H3` headers as **thematic grouping / narrative** headers — each holding a
hand-authored free-form bullet list rather than the strict feature-field block —
is rejected on the first such header with:

```
Feature "<grouping header>" has invalid status: "(missing)".
```

Because the whole file fails to parse, **all read-only tooling fails too**:
`harness:roadmap --command pilot`, `manage_roadmap` reads, and the
`roadmapHealth` check in `harness validate`.

`parseRoadmap` is not buggy — it returns a clean `Result` `Err` naming the
offending section (working as designed). The gap is **expressiveness**: there is
no sanctioned way to author a grouped/narrative roadmap section and still have
the file be machine-readable.

**Goal:** an additive, backward-compatible parser change so that

1. a roadmap with narrative grouping sections **parses successfully**,
2. existing strict one-feature-per-`H3` roadmaps **validate identically** (no
   regression to `harness validate` roadmapHealth on this repo's own roadmap),
3. malformed feature input **still errors cleanly**, and
4. narrative sections are **never silently dropped** on any write path.

### Non-goals

- Redesigning the roadmap model or the milestone→features shape (every consumer
  reads `milestone.features`; that must not change).
- Nested-feature syntax inside a group (the reporter's Option 1). Groups are
  narrative, not machine-parsed feature trees.
- Grouping support in **sharded** mode. Shards are one-row-per-file strict
  features by construction; narrative grouping is a hand-authored **monolith**
  concern. Sharded assembly stays strict.
- Inferring group-ness from content (e.g. "an H3 with no `Status:` bullet is a
  group"). The reporter explicitly rejects silent/inferred skipping — it would
  drop real work and give misleading pilot results. The marker is **explicit**.

## Decisions made

### D1 — Explicit `### Group: <name>` heading marker

A grouping section is an `### H3` whose heading text begins with the literal
prefix `Group: `. This is the sanctioned, explicit opt-in marker.

- **Why a heading-prefix marker:** it is symmetric with the parser's existing
  `### Feature: <name>` prefix convention (both are handled in one place,
  `parseFeatures`), it is discoverable and self-documenting in the raw markdown,
  and it requires no frontmatter flag or fenced-block machinery.
- **Why explicit, not inferred:** the reporter requires that non-conforming H3s
  are never silently skipped. An author must deliberately write `### Group:` to
  opt a section out of feature validation; a plain `### H3` missing its status
  still errors exactly as today.
- **Rejected alternatives:**
  - _Frontmatter flag / fenced marker (Option 2 verbatim):_ heavier; splits the
    signal away from the section it governs.
  - _Content inference (Option 1):_ violates the explicit-marker requirement.
  - _HTML-comment marker (`<!-- group -->`):_ invisible in rendered markdown and
    asymmetric with the existing `Feature:` prefix.

### D2 — Groups are captured verbatim, never dropped

When the parser recognizes a group, it captures `{ name, body }` where `body` is
the verbatim markdown of the section (trimmed of surrounding blank lines) and
attaches it to the milestone. `serializeRoadmap` re-emits groups so that any
parse → mutate → serialize write path (monolith `manage_roadmap`
update/promote/sync, migration round-trip) **preserves** the narrative rather
than silently deleting it. This directly answers the reporter's stated fear that
conforming such a roadmap "would flatten and destroy the arc narrative."

### D3 — Group bodies are not feature-validated

The explicit marker is authoritative: a group's body is recorded as-is and is
**not** scanned for `- **Status:**` / feature fields. Inline free-text like
`Status: shipped` or cross-repo issue links inside a group never trigger
validation. Feature H3s remain strictly validated (missing/invalid status still
errors).

### D4 — Additive optional model field (backward compatible)

`RoadmapGroup` is a new type; `RoadmapMilestone.groups?` is a new **optional**
field. It is populated **only when a milestone actually has groups**. A strict
roadmap's milestones are constructed exactly as before (no `groups` key), so
existing parsed objects — and the `VALID_ROADMAP` fixture equality assertion —
are unchanged. Every existing constructor of `RoadmapMilestone` (assembler,
tests, serializer inputs) continues to type-check because the field is optional.

## Technical design

### Types (`packages/types/src/roadmap.ts`)

```ts
/**
 * A thematic grouping / narrative section in a milestone. Authored as an
 * `### Group: <name>` H3. Its body is free-form markdown captured verbatim and
 * NOT parsed as roadmap features.
 */
export interface RoadmapGroup {
  /** Group/theme name (heading text after the "Group: " prefix). */
  name: string;
  /** Verbatim markdown body of the section (trimmed of surrounding blank lines). */
  body: string;
}

export interface RoadmapMilestone {
  name: string;
  isBacklog: boolean;
  features: RoadmapFeature[];
  /** Narrative grouping sections, in document order. Present only when non-empty. */
  groups?: RoadmapGroup[];
}
```

Re-export `RoadmapGroup` from `packages/types/src/index.ts`.

### Parser (`packages/core/src/roadmap/parse.ts`)

- Add a `GROUP_PREFIX = 'Group: '` constant.
- In `parseFeatures`, keep the existing H3 split. For each H3 section, branch on
  whether the captured heading text starts with `GROUP_PREFIX`:
  - **Group:** strip the prefix to get the name; capture the section body
    verbatim (the existing `sectionBody.slice(...)` between this heading and the
    next H3), `.trim()` it; push `{ name, body }` to a `groups` array. Skip
    feature validation entirely.
  - **Feature:** unchanged — `parseFeatureBlock(name, body)`.
- `parseFeatures` returns `{ features, groups }` instead of just `features`.
- `parseMilestones` builds the milestone with `features`, and adds `groups` only
  when `groups.length > 0` (preserving byte-identical object shape for strict
  roadmaps).
- `parseFeatureBlock` and `validateStatus` are untouched — the strict contract
  is intact for real features.

### Serializer (`packages/core/src/roadmap/serialize.ts`)

- After a milestone's `features` loop, if `milestone.groups?.length`, emit each
  group: a blank line, `### Group: <name>`, a blank line, then `body`.
- Groups serialize **after** a milestone's strict features. The sanctioned
  layout (documented) places narrative groups after strict features within a
  milestone, or in dedicated all-narrative milestones — which makes
  parse→serialize→parse object round-trip hold.

### `harness validate` roadmapHealth — no change needed

`checkRoadmapHealth` (`packages/core/src/roadmap/health.ts`) iterates
`milestone.features` only. Groups are invisible to it, so roadmapHealth behavior
on this repo's strict roadmap is unchanged. The change is verified by leaving the
existing roadmapHealth suite green and running `harness validate` in the gauntlet.

## Integration Points

- **Entry Points:** no new CLI command, MCP tool, or skill. The behavior change
  is internal to the `parseRoadmap` / `serializeRoadmap` seam that every
  read-only roadmap tool already flows through (`RoadmapStore`, pilot,
  `manage_roadmap`, `harness validate`).
- **Registrations Required:** `RoadmapGroup` export from the `types` barrel.
  Regenerate any generated reference docs (`generate-docs --check`) and plugin
  manifest (`generate:plugin:check`) — expected no functional delta; plugin
  count unchanged.
- **Documentation Updates:** document the `### Group:` convention in a roadmap
  authoring guide (`docs/guides/roadmap-sharding.md` or a sibling roadmap-format
  section). No internal issue/PR numbers in shipped docs.
- **Architectural Decisions:** None rising to a standalone ADR — this is an
  additive, backward-compatible extension of an existing documented format, not
  a new architectural boundary. The decisions above live in this spec.
- **Knowledge Impact:** the roadmap format now has a sanctioned narrative
  grouping concept; a short knowledge note on the `### Group:` marker may be
  added, but is optional for this change.

## Success criteria

1. **Grouped roadmap parses.** A roadmap containing one or more
   `### Group: <name>` sections (each with a free-form bullet list, including
   inline `Status:` free-text and cross-repo links) parses to `Ok`, with the
   group captured on `milestone.groups` and no `RoadmapFeature` emitted for it.
2. **Strict roadmap validates unchanged.** The existing `VALID_ROADMAP_MD`
   fixture parses to exactly `VALID_ROADMAP` (no `groups` key on its
   milestones); all pre-existing parse/serialize/round-trip tests stay green.
3. **Malformed input still errors cleanly.** A **feature** H3 (no `Group:`
   marker) missing/invalid `Status` still returns a clean `Err` naming the
   section — identical message to today.
4. **Round-trip preserves groups.** parse → serialize → parse of a grouped
   roadmap yields an equal object (groups preserved, not dropped).
5. **Read-only tooling stops failing.** `harness validate` roadmapHealth on a
   grouped roadmap no longer fails; this repo's own strict roadmap continues to
   pass `harness validate`.
6. **Marker is explicit.** A plain `### <name>` H3 with no status still errors
   (no silent inference).

## Implementation order

- **Phase 1 — Model + parser + serializer + tests (single cohesive phase).**
  1. Add `RoadmapGroup` type + optional `groups` on `RoadmapMilestone`; export
     from the types barrel.
  2. Teach `parseFeatures`/`parseMilestones` the `### Group:` marker (capture
     verbatim, gate `groups` on non-empty).
  3. Teach `serializeRoadmap` to re-emit groups.
  4. Tests: grouped roadmap parses (crit. 1); strict roadmap unchanged
     (crit. 2); malformed feature still errors (crit. 3); round-trip preserves
     groups (crit. 4); explicit-marker (crit. 6). Add a grouped fixture.
  5. Docs: document the `### Group:` convention. Changeset.
  6. Gauntlet: full `turbo run build`, `generate-docs --check`,
     `generate:plugin:check`, `harness validate`, arch baselines unchanged.

The change is small and cohesive enough to land as one phase.
