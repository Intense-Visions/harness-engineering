# Plan: UAT Sign-off Dashboard Front Door (Phase 1)

**Date:** 2026-08-16
**Spec:** docs/changes/uat-user-sign-off-loop/proposal.md
**Phase:** 1 of 1 (dashboard front door over the existing sign-off record primitive)
**Complexity:** medium
**Estimated tasks:** 6

## Goal

Surface the already-shipped UAT sign-off record primitive (`UatSignoffRecorder`,
the `uat_signoff` MCP tool, the `harness-uat-signoff` skill) as a **Sign-off page
in the dashboard `client` (and `pm-ba`) lane**. Add a read route that resolves a
change's acceptance basis (Success Criteria with soft-degrade), a write route that
records the human decision through the exact same recorder and writes
`docs/changes/<slug>/signoff.md`, one React page, and the navigation wiring. No new
node type, no new authority, no LLM — a new presentation + capture surface over an
existing record-only contract.

## Observable Truths (Acceptance Criteria)

Mirrors the proposal's nine acceptance criteria; each names its covering check.

1. **AC-1** — Rendering the dashboard as `role=client` (and `role=pm-ba`) lists a
   `Sign-off` nav entry routing to `/s/signoff`. _Check:_ `pagesForRole('client')`
   / `pagesForRole('pm-ba')` unit assertions in `roles.test.ts`.
2. **AC-2** — `GET /api/signoff/:slug` for a change with a `## Success Criteria`
   section returns each criterion as `{id,text}` with `basisSection:'Success
Criteria'`. _Check:_ route test over a fixture change.
3. **AC-3** — Read route soft-degrades: no Success Criteria → `User-Visible
Behavior` → `Overview`; no proposal → `items:[]`, `basisSection:null`, HTTP 200
   (never 5xx). _Check:_ route tests over a fallback fixture and a no-proposal slug.
4. **AC-4** — `POST /api/signoff` persists exactly one `execution_outcome` node via
   `UatSignoffRecorder` with `metadata.source='uat-signoff'` and `result=success`
   iff `decision==='ACCEPTED'`; no second node type. _Check:_ route test counts
   `findNodes({type:'execution_outcome'})` before/after.
5. **AC-5** — `POST /api/signoff` writes `docs/changes/<slug>/signoff.md` with the
   overall decision, signer, ISO timestamp, and an Accepted vs
   Rejected/changes-requested split. _Check:_ route test asserts file contents.
6. **AC-6** — `POST /api/signoff` missing `decision`/`signedOffBy`, or with an item
   lacking a disposition, returns 4xx and records nothing (no node, no file).
   _Check:_ route test posts each malformed body, asserts 4xx + unchanged graph.
7. **AC-7** — The client page submit control is disabled until every item has a
   disposition, an overall verdict is selected, and a non-empty signer is entered.
   _Check:_ component test over a two-item basis.
8. **AC-8** — An already-signed change renders read-only: `GET` returns `existing`;
   the page shows the prior decision with a "record a new sign-off" affordance.
   _Check:_ route test asserts `existing` populated; component test asserts
   read-only render.
9. **AC-9** — The sign-off blocks nothing: the POST response is a record-only
   confirmation (`recorded:true`, `outcomeId`, `signoffPath`); the handler invokes
   only the recorder + file write (no gate/CI call). _Check:_ route test asserts
   response shape; module imports no pipeline/gate dependency.

**Non-regression:** dashboard test + typecheck + lint stays green; `dev`-lane
navigation is unchanged.

## File Map

```
CREATE packages/dashboard/src/server/gather/signoff.ts        (basis extraction + soft-degrade + signoff.md read/write helpers)
CREATE packages/dashboard/src/server/routes/signoff.ts        (GET /api/signoff/:slug, POST /api/signoff)
CREATE packages/dashboard/src/client/pages/Signoff.tsx        (client page)
CREATE packages/dashboard/tests/server/gather/signoff.test.ts (basis parser unit — AC-2/AC-3)
CREATE packages/dashboard/tests/server/routes/signoff.test.ts (route tests — AC-2..AC-6, AC-8, AC-9)
CREATE packages/dashboard/tests/client/pages/Signoff.test.tsx (component tests — AC-1 wiring, AC-7, AC-8 render)
MODIFY packages/dashboard/src/shared/types.ts                 (SignoffBasis / SignoffItem / SignoffRecord / SignoffDecision / SignoffItemDisposition)
MODIFY packages/dashboard/src/server/index.ts                 (register buildSignoffRouter)
MODIFY packages/dashboard/src/client/types/thread.ts          (SYSTEM_PAGES: signoff entry)
MODIFY packages/dashboard/src/client/types/roles.ts           (client + pm-ba lane allowlists)
MODIFY packages/dashboard/src/client/components/layout/ThreadView.tsx (route signoff → Signoff page)
MODIFY packages/dashboard/package.json                        (+ @harness-engineering/intelligence dep)
MODIFY harness.config.json                                    (dashboard layer allowedDependencies += intelligence)
MODIFY agents/skills/claude-code/uat-signoff/SKILL.md         (one-line dashboard front-door cross-reference)
CREATE .changeset/<slug>.md
```

## Tasks

### Task 1: Shared types

Add `SignoffItemDisposition`, `SignoffDecision`, `SignoffItem`, `SignoffRecord`,
`SignoffBasis` to `shared/types.ts`. `SignoffBasis = { slug; items: {id;text}[];
basisSection: 'Success Criteria' | 'User-Visible Behavior' | 'Overview' | null;
existing?: SignoffRecord }`.

### Task 2: Gather module (basis extraction + artifact I/O) — TDD (AC-2, AC-3, AC-5, AC-8)

`gather/signoff.ts`: reuse the outcome-eval fallback-chain semantics (Success
Criteria → User-Visible Behavior → Overview) to resolve the basis section from
`docs/changes/<slug>/proposal.md`; parse top-level list items into `{id,text}`
(ids `SC1..SCn` by ordinal, matching the recorder/skill convention); read any
existing `signoff.md`; render `signoff.md` from the skill's template. Absent
proposal → `items:[]`, `basisSection:null`. Unit-test the parser + soft-degrade.

### Task 3: Read + write routes — TDD (AC-2..AC-6, AC-8, AC-9)

`routes/signoff.ts`: `GET /api/signoff/:slug` returns `ApiResponse<SignoffBasis>`;
`POST /api/signoff` validates required fields (reusing the tool's `validateInput`
shape — reject missing decision/signer or any item without a disposition), records
via `UatSignoffRecorder` against `resolveGraphDir(projectPath)`, writes
`signoff.md` under `withFileLock`, invalidates caches, returns `{recorded,
outcomeId, result, signoffPath}`. No pipeline/gate import.

### Task 4: Register + navigate (AC-1)

Register `buildSignoffRouter(ctx)` in `server/index.ts`; add the `signoff`
`SYSTEM_PAGES` entry (`/s/signoff`); add `'signoff'` to `client` and `pm-ba` lane
allowlists in `roles.ts`; map `signoff → Signoff` in `ThreadView.tsx`. Extend
`roles.test.ts` for AC-1.

### Task 5: Client page — TDD (AC-7, AC-8 render)

`Signoff.tsx`: fetch basis by `slug` query param, render one neutral row per item
(ACCEPT / CHANGES_REQUESTED / REJECT + optional note), an overall-verdict control,
a signer field; submit disabled until every item ruled + verdict chosen + signer
non-empty; on submit POST then render the recorded confirmation; when `existing`
present render prior decision read-only with a "record a new sign-off" affordance.
Component tests for the gating and read-only render.

### Task 6: Deps, docs, changeset, verify

Add `@harness-engineering/intelligence` to `packages/dashboard/package.json`;
add `intelligence` to the dashboard layer `allowedDependencies` in
`harness.config.json`; add the one-line dashboard cross-reference to the
`uat-signoff` SKILL.md; add a changeset. Run dashboard test + typecheck + lint +
`pnpm format` green; regenerate the roadmap aggregate from the shard.

## Checkpoints

- **After Task 3:** run the route + gather tests; confirm AC-2..AC-6/AC-8/AC-9
  observable before building the UI.
- **After Task 5:** run the full dashboard suite (server + client projects) green.
- **Before commit:** `pnpm turbo build` (pre-commit runs a fail-closed arch gate);
  `pnpm format`; regen roadmap aggregate.

## Decisions / Constraints

- **Reuse, don't rebuild.** The write path calls the exact `UatSignoffRecorder`;
  a browser sign-off and a CLI sign-off are the same `execution_outcome` node.
- **Human is the sole authority; the surface pre-selects nothing** and blocks
  nothing (advisory / record-only) — identical contract to the MCP tool.
- **Open the dashboard→intelligence boundary** (`allowedDependencies`) as the one
  build-time consequence of the mandatory recorder reuse.
