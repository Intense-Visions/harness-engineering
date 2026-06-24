---
module: cli/mcp/roadmap
tags:
  [shared-rule, dual-backend, translation-layer, field-preservation, tracker-sync, promote, roadmap]
problem_type: write-asymmetry
last_updated: '2026-06-24'
track: knowledge-track
category: architecture-patterns
---

# A core rule consumed by two storage backends must patch only the fields it actually changed

## Context

A single business rule in `@harness-engineering/core` (`promoteFeature`,
`packages/core/src/roadmap/promote.ts`) is consumed by two storage backends behind the
`manage_roadmap` MCP tool:

- **File mode** serializes the _whole_ roadmap and overwrites `docs/roadmap.md`
  (`packages/cli/src/mcp/tools/roadmap.ts`).
- **File-less mode** sends a _field-level patch_ to an external tracker via
  `RoadmapTrackerClient.update(externalId, patch)`
  (`packages/cli/src/mcp/tools/roadmap-file-less.ts`).

The rule deliberately _preserves_ some fields (D2: status is preserved on a `spec-updated`
transition; D5: a human-authored summary is never overwritten). In file mode this
preservation is invisible — the serializer writes the unchanged value back as part of the
full document, a no-op. The first file-less implementation mirrored that shape literally:
`patch = { status: target.status, spec: target.spec }` plus summary-if-truthy. That re-sent
the unchanged `status` and the unchanged human `summary` to the tracker on every promote.

The values were identical, so nothing was _lost_ — which is exactly why it slipped past the
happy-path tests and was only caught in code review. But on a patch-style backend, writing a
"preserved" field is not a no-op: it can bump `updatedAt`, append an audit-history entry, and
trip directional-sync regression guards that compare server vs. local state. The asymmetry is
a property of the _write surface_ (full-document replace vs. field patch), not of the rule.

The fix: diff the original backend record against the rule's result and include only the
fields that actually changed.

```ts
const original = all.value.features.find((f) => f.name.trim().toLowerCase() === key);
const patch: FeaturePatch = {};
if (!original || target.spec !== original.spec) patch.spec = target.spec;
if (!original || target.status !== original.status) patch.status = target.status;
if (!original || target.summary !== original.summary) patch.summary = target.summary;
```

(Caught in code review; fixed in the same PR as the feature.)

## Guidance

- **When a shared core rule writes through more than one backend, the translation layer owns
  the diff.** The rule returns the desired end-state (here, `nextRoadmap`). A full-document
  backend can write the whole end-state safely. A patch/PATCH/upsert backend must compute
  `changed = endState \ originalState` and send only that. Do not literally mirror the
  full-replace shape into a patch call.
- **"Preserve" is a property of the rule; "no-op write" is a property of the backend.** A
  field the rule preserves is still a _write_ if you put it in a patch. Treat "preserved
  field" and "unchanged field in the patch" as the same obligation: leave it out.
- **Test the patch, not just the end-state.** Happy-path assertions on the resulting record
  (`status === 'planned'`) pass for both the correct and the over-writing implementation.
  Add a test that captures the patch argument and asserts its _exact key set_
  (`expect(patch).toEqual({ spec })` for a status-preserving transition). That is the only
  assertion that distinguishes "changed the right fields" from "re-wrote everything."
- **Keep the decision logic single-sourced (see [ADR 0043](../../../knowledge/decisions/0043-roadmap-rules-in-core.md)).**
  The point of putting the rule in core is that both backends agree on _what_ changes. The
  translation layer should be mechanical (build a roadmap from the backend, call the rule,
  diff the result) and contain no state-machine logic of its own.

### Secondary note — editing symlinked platform skill variants

The four platform `SKILL.md` variants (`agents/skills/{claude-code,cursor,gemini-cli,codex}/<skill>/`)
are not copies: `cursor`, `gemini-cli`, and `codex` are directory symlinks to
`../claude-code/<skill>`. Consequences when a task says "update all platform variants":

- Editing `claude-code/.../SKILL.md` updates all four by construction — cross-platform parity
  is structural, not a thing you maintain by hand.
- `git` only stages the real path. `git add agents/skills/cursor/.../SKILL.md` fails with
  `fatal: pathspec ... is beyond a symbolic link`. Stage and commit the `claude-code` path
  only.
- Tools that compare on-disk content (md5, a fresh `grep`) will show all four as already
  updated, but `git status` may list only the real path because of git's stat-cache. Don't
  chase the "missing" three — verify with `ls -l` that they're symlinks and move on.

## Applicability

- **Applies to:** any feature where one core function's result is persisted through both a
  full-document store and a field-level/remote-patch store (roadmap file vs. tracker, local
  cache vs. API, config file vs. key-value service). The risk scales with how much the patch
  backend reacts to writes (audit logs, timestamps, optimistic-concurrency / sync guards).
- **Does not apply to:** single-backend features, or two backends that both do full-document
  replace (the asymmetry vanishes), or genuinely idempotent patch endpoints that ignore
  unchanged values server-side (rare — don't assume it).
- **Smell test:** if your patch-builder reads fields off the rule's _result_ unconditionally
  (`patch = { a: result.a, b: result.b }`) rather than off the _diff_, you have this bug
  latent even if today's values happen to match.
