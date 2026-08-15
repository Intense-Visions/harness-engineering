---
feature: uat-user-sign-off-loop
status: draft
tier: medium
roadmap: github:Intense-Visions/harness-engineering#710
keywords: uat, sign-off, dashboard, client-lane, acceptance, brd, outcome-edge, full-lifecycle-reach
---

# UAT / User Sign-off Loop — Dashboard Front Door (close the outcome edge)

> **STATUS: DRAFT SPEC — autonomously drafted for human review. Not build-ready
> until a maintainer accepts it.** Authored upstream so a `roadmap-fleet` lane has
> a grounded, buildable slice to execute. Review the scoping in "Open Questions"
> before promoting `status: draft → planned`.

## Overview & Goals

Roadmap item #710 asks for the mirror of `product-advisor` at the **far end of the
lifecycle**: validate SHIPPED work against the intent captured at inception,
**client-facing and dashboard-driven**, closing the inception → acceptance circle
that is currently open.

**What already exists (do not rebuild it).** The acceptance _record_ primitive is
already shipped and must be reused, not duplicated:

- **`harness-uat-signoff` skill** (`agents/skills/claude-code/uat-signoff/SKILL.md`)
  — a CLI/agent-driven, plain-text, one-item-at-a-time interview that records a
  human's acceptance of a change against its `docs/changes/<slug>/proposal.md`
  Success Criteria, writes `docs/changes/<slug>/signoff.md`, and feeds the graph.
- **`uat_signoff` MCP tool** (`packages/cli/src/mcp/tools/uat-signoff.ts`) and
  **`UatSignoffRecorder`** (`packages/intelligence/src/uat-signoff/recorder.ts`)
  — persist ONE `execution_outcome` node (`metadata.source = 'uat-signoff'`,
  `result: success` iff `ACCEPTED`) that the eval-fail-rate signal already consumes.
  Advisory / record-only; derives no authority, runs no LLM.

**What #710 actually needs (the real gap).** The shipped primitive is reachable
only through the CLI/agent surface. STRATEGY.md's Full-lifecycle-reach track is
explicit that the two human edges must be reached **"through role-shaped front
doors (guided interviews, dashboard lanes) rather than the CLI."** The dashboard
already has a **`client` role lane** (`packages/dashboard/src/client/types/roles.ts`),
but it renders only `roadmap` + `traceability` — there is **no sign-off surface**.
A non-technical client cannot today adjudicate shipped work; they would have to
open Claude Code and run a skill. That is the open edge.

**Goal (this slice):** surface the already-shipped sign-off primitive as a
**dashboard page in the `client` lane** — a browser front door where a
non-engineer reviews the acceptance basis for a shipped change, rules each item
and the overall verdict, provides their signer identity, and records the decision
through the existing `UatSignoffRecorder`. No new node type, no new verdict
authority, no LLM — the dashboard is a new _presentation + capture surface_ over
the existing record-only contract.

## The distinction (why this is a distinct item, not a duplicate)

Three sign-off-adjacent capabilities exist; keeping them distinct is the point of
this item. This slice touches only the third row's _surface_:

| Capability              | Question it answers                                           | Judge     | Authority           | Blocks? | Surface (today)                               |
| ----------------------- | ------------------------------------------------------------- | --------- | ------------------- | ------- | --------------------------------------------- |
| `acceptance-eval`       | Is the spec measurable _before_ we build?                     | LLM       | TS-derived          | Yes     | pipeline gate                                 |
| `outcome-eval`          | Did the code satisfy the spec?                                | LLM       | TS-derived          | Yes     | pipeline gate                                 |
| **UAT sign-off (#710)** | Does the **human** accept the shipped reality against intent? | **Human** | none (records only) | **No**  | CLI skill only → **+ dashboard (this slice)** |

`acceptance-eval` and `outcome-eval` are machine verdicts that gate merge/ship.
UAT is intent-vs-shipped-reality, **human-judged and advisory**. This slice does
NOT change that contract; it only gives the human a dashboard door to it.

## Decisions Made

1. **Reuse `UatSignoffRecorder`; add no new node type or authority.** The write
   path from the dashboard calls the exact same recorder the MCP tool calls, so a
   sign-off captured in the browser and one captured in the CLI are the same
   `execution_outcome` node. _Rationale:_ #710 is a missing _front door_, not a
   missing capability; a second record path would fork the acceptance history.

2. **Scope the slice to a change (`docs/changes/<slug>/`), not a whole
   engagement.** The shard's phrase "validate against the BRD's open items" is the
   full vision (engagement-level, `docs/inception/<engagement>/brd.md`). This slice
   surfaces the acceptance basis the recorder already understands — a change's
   `## Success Criteria` — because that is the basis already on disk for shipped
   work and already wired to the node. Engagement/BRD-level roll-up is deferred
   (see Open Questions). _Rationale:_ a buildable slice must key off an acceptance
   basis that already exists; inventing BRD-level plumbing is a separate item.

3. **Render in the existing `client` lane; add one `SYSTEM_PAGES` entry + one lane
   allowlist entry.** No new role, no auth model. _Rationale:_ the `client` lane
   and its presentation-only role model already exist; this is an additive page.

4. **Read + write via two new Hono routes under `/api`, mirroring the existing
   route pattern.** `GET /api/signoff/:slug` returns the acceptance basis (the
   Success-Criteria items) so the browser can render the checklist; `POST
/api/signoff` accepts the ruled decision and calls `UatSignoffRecorder` +
   writes `signoff.md`. _Rationale:_ matches `traceability.ts` (read) and
   `actions.ts` (write, `c.req.json`, `withFileLock`, cache-invalidate) so the
   slice is a same-shaped addition, not a new architecture.

5. **The human is the sole authority; the surface pre-selects nothing.** The
   dashboard renders items neutrally, requires an explicit disposition per item,
   an explicit overall verdict, and a typed signer identity before the POST is
   enabled. _Rationale:_ preserves the skill's Iron Law ("the human makes the
   verdict; the skill only records it") in the new surface — inferring a verdict
   from green tests is the one unforgivable failure.

6. **Advisory / record-only; blocks nothing.** The POST returns the recorded
   node id and the written artifact path; it never gates a merge, ship, or
   pipeline step. _Rationale:_ identical contract to the MCP tool.

## Technical Design

**New server routes** — `packages/dashboard/src/server/routes/signoff.ts`,
registered in `packages/dashboard/src/server/index.ts` via
`app.route('/api', buildSignoffRouter(ctx))`:

- `GET /api/signoff/:slug` — resolve `docs/changes/<slug>/proposal.md`, extract the
  `## Success Criteria` items (id + text), and report any existing
  `docs/changes/<slug>/signoff.md` so an already-signed change renders read-only.
  Returns `ApiResponse<SignoffBasis>` where `SignoffBasis = { slug, items:
{id,text}[], basisSection: 'Success Criteria' | 'User-Visible Behavior' |
'Overview' | null, existing?: SignoffRecord }`. Soft-degrades exactly as the
  skill does: absent Success Criteria falls back to `## User-Visible Behavior`
  then `## Overview`, recording which section was used; absent proposal returns
  `items: [], basisSection: null` (the UI then shows "no acceptance basis on disk").
- `POST /api/signoff` — body `{ slug, decision, signedOffBy, items:
{id,disposition,note?}[], criteriaRefs?: string[] }`. Validates required fields
  (reusing the tool's `validateInput` shape), calls `UatSignoffRecorder.record(...)`
  against the resolved graph dir, writes `docs/changes/<slug>/signoff.md` using the
  skill's template, invalidates the relevant caches, and returns `{ recorded:
true, outcomeId, result, signoffPath }`. Wrapped in `withFileLock` like
  `actions.ts`.

**Shared types** — add `SignoffBasis`, `SignoffItem`, `SignoffRecord`, and a
`SignoffDecision` union to `packages/dashboard/src/shared/types.ts`.

**New client page** — `packages/dashboard/src/client/pages/Signoff.tsx` (or under
an existing pages dir), plus:

- one entry in `SYSTEM_PAGES` (`packages/dashboard/src/client/types/thread.ts`):
  `{ page: 'signoff', label: 'Sign-off', route: '/s/signoff' }`;
- add `'signoff'` to the `client` lane allowlist in
  `packages/dashboard/src/client/types/roles.ts` (`ROLE_LANES.client.pages`), and
  to `pm-ba` as well (both adjudicate).

The page: takes a `slug` (query param or a small picker over `docs/changes/*`
that have shipped), `GET`s the basis, renders one row per acceptance item with a
neutral ACCEPT / CHANGES_REQUESTED / REJECT control and an optional note, an
overall-verdict control, and a signer field. The submit button is disabled until
every item is ruled, an overall verdict is chosen, and a signer is typed. On
submit it `POST`s and then renders the recorded confirmation (node id + signoff.md
path). If `existing` is present the page renders the prior decision read-only with
a "record a new sign-off" affordance.

**Reused, not rebuilt:** `UatSignoffRecorder`, the `execution_outcome` node shape,
the `client` lane + role model, the Hono route/context/cache patterns, the
`signoff.md` template. This slice adds a surface; it does not add a capability.

## Integration Points

- **Entry Points:** new page route `/s/signoff` in the dashboard client; new
  `GET /api/signoff/:slug` + `POST /api/signoff` server routes.
- **Registrations Required:** `buildSignoffRouter` in `server/index.ts`; one
  `SYSTEM_PAGES` entry in `client/types/thread.ts`; `'signoff'` added to the
  `client` and `pm-ba` lane allowlists in `client/types/roles.ts`; shared types in
  `shared/types.ts`.
- **Documentation Updates:** dashboard `README.md` route table if it enumerates
  API routes; a one-line mention in the `uat-signoff` SKILL.md that a dashboard
  front door to the same record exists (the skill and the dashboard write the same
  node — call this out so they are not treated as rival records).
- **Architectural Decisions:** none — additive surface over an existing contract;
  no ADR. If a reviewer decides engagement/BRD-level roll-up (deferred) belongs in
  scope, that expansion likely warrants its own ADR.
- **Knowledge Impact:** reinforces `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`
  — closes the "UAT sits where a non-engineer meets the pipeline" edge on the
  dashboard, the exact surface that doc names as the lever.

## Acceptance Criteria

Each is a **user-visible behavior with a covering, observable check** (per the
`acceptance-eval` measurability standard). "Covering check" names the concrete
test/observation that proves it.

1. **The `client` (and `pm-ba`) lane shows a Sign-off page.** Rendering the
   dashboard as `role=client` lists a `Sign-off` nav entry routing to `/s/signoff`.
   _Covering check:_ a unit test on `pagesForRole('client')` asserts a `signoff`
   entry is present with route `/s/signoff`; same for `pagesForRole('pm-ba')`.

2. **The read route returns the acceptance basis for a change.** `GET
/api/signoff/:slug` for a change whose `proposal.md` has a `## Success Criteria`
   section returns each criterion as `{id, text}` with `basisSection: 'Success
Criteria'`. _Covering check:_ a server route test over a fixture change asserts
   the returned `items` match the fixture's criteria and `basisSection` is
   `'Success Criteria'`.

3. **The read route soft-degrades on a thin basis.** For a change with no `##
Success Criteria` the route falls back to `## User-Visible Behavior` then `##
Overview` and reports which via `basisSection`; for a change with no
   `proposal.md` it returns `items: []` and `basisSection: null` (never a 5xx).
   _Covering check:_ route tests over (a) a no-Success-Criteria fixture assert the
   fallback section, and (b) a no-proposal slug assert `items: []`, `basisSection:
null`, HTTP 200.

4. **A submitted sign-off records exactly one `execution_outcome` node via the
   existing recorder.** `POST /api/signoff` with a valid decision persists one
   node with `metadata.source = 'uat-signoff'` and `result = success` iff
   `decision === 'ACCEPTED'` (else `failure`), and no second node type is created.
   _Covering check:_ a route test posts a decision, then asserts the graph gained
   exactly one `execution_outcome` node with the expected `source` and `result`.

5. **A submitted sign-off writes `docs/changes/<slug>/signoff.md`.** The written
   artifact contains the overall decision, signer identity, an ISO timestamp, and
   an Accepted vs Rejected/changes-requested split of items. _Covering check:_ a
   route test asserts `signoff.md` exists after the POST and contains the overall
   decision line, the signer, and both item sections.

6. **The write path rejects an incomplete decision (no inferred verdict).** `POST
/api/signoff` missing `decision` or `signedOffBy`, or with an item lacking a
   disposition, returns a 4xx and records nothing. _Covering check:_ a route test
   posts each malformed body and asserts a 4xx plus an unchanged graph (no node
   added) and no `signoff.md` written.

7. **The submit control is gated on a complete human decision.** In the client
   page, the submit button is disabled until every item has a disposition, an
   overall verdict is selected, and a non-empty signer is entered. _Covering
   check:_ a component test renders the page with a two-item basis and asserts
   `submit.disabled === true` until all three conditions are met, then `false`.

8. **An already-signed change renders read-only.** When `signoff.md` already
   exists, `GET /api/signoff/:slug` returns it as `existing`, and the page shows
   the prior decision read-only with a "record a new sign-off" affordance rather
   than silently overwriting. _Covering check:_ a route test asserts `existing` is
   populated for a pre-signed fixture; a component test asserts the read-only
   render.

9. **The sign-off blocks nothing.** The POST response is a record-only
   confirmation (`recorded: true`, `outcomeId`, `signoffPath`); no merge, ship, or
   pipeline call is made. _Covering check:_ the route test asserts the response
   shape and that the handler invokes only the recorder + file write (no gate/CI
   invocation) — asserted by the absence of any pipeline dependency in the route
   module.

**Non-regression:** the dashboard package test + typecheck + lint suite stays
green; `dev`-lane navigation is unchanged (it already sees every page).

## Implementation Order

1. **Shared types + read route.** Add `SignoffBasis`/`SignoffItem`/`SignoffRecord`
   to `shared/types.ts`; implement `GET /api/signoff/:slug` with the
   Success-Criteria extraction + soft-degrade; tests for AC-2, AC-3, AC-8 (read).
2. **Write route.** Implement `POST /api/signoff` over `UatSignoffRecorder` +
   `signoff.md` writer + `withFileLock`; tests for AC-4, AC-5, AC-6, AC-9.
3. **Register + navigate.** Wire `buildSignoffRouter` in `server/index.ts`; add the
   `SYSTEM_PAGES` entry and the `client`/`pm-ba` lane allowlist entries; test AC-1.
4. **Client page.** Build `Signoff.tsx` (basis fetch, per-item controls, gated
   submit, confirmation + read-only states); component tests for AC-7, AC-8 (render).
5. **Docs + verify.** Update the dashboard README route table and the one-line
   cross-reference in the `uat-signoff` SKILL.md; run package test + typecheck +
   lint green.

## Open Questions (resolve before promoting to build-ready)

1. **Engagement/BRD-level roll-up (the shard's "validate against the BRD's open
   items").** This slice keys off a change's Success Criteria (the basis already on
   disk). Do we want a follow-up item that rolls up all changes traced to a
   `docs/inception/<engagement>/brd.md` + `gaps.md` into one client sign-off view?
   Recommended: yes, as a **separate** #710-follow-up, because it needs
   change→BRD traceability plumbing that does not exist yet.
2. **Change discovery for the picker.** Should the page list all
   `docs/changes/*` with a shipped/merged marker, or require an explicit `slug`
   query param? Recommended: explicit `slug` for the slice; a picker is a small
   follow-up once a "shipped" signal is available.
3. **Multi-user signer identity.** The dashboard role model is presentation-only
   today (no authenticated sessions). Signer identity is a typed free-text field
   for now; when hosted multi-user auth lands, bind it to the session. Recommended:
   free-text now, note the follow-up.
