# Item-type routing for build-shaped fleet members

**Status:** approved
**Keywords:** fleet, routing, brainstorming, autopilot, debugging, item-type, dispatch, roadmap-fleet, security-fleet

## Overview and goals

The build-shaped `-fleet` members — `roadmap-fleet` and `security-fleet` — force **every**
item through the design-first pipeline `harness-brainstorming → harness-autopilot`, regardless of
whether the item is a new feature that needs design or a bug with a known/investigable root cause.
The word "bug" never appears in their dispatch logic
(`roadmap-fleet/SKILL.md:88`, `security-fleet/SKILL.md:114`).

The consequence: a bug tracked as a roadmap row is forced through brainstorming (design ceremony it
does not need), then stalls in autopilot, which has no `## Implementation Order` to parse
(`harness-autopilot/SKILL.md:406`). The same misfit exists in `security-fleet`'s FIX tier, where a
bounded vulnerability with a known remedy is diagnostic work — a debugging job, not a design job.

**Goal:** make the build-shaped members **classify each item by type and route it to the correct
pipeline**, reusing the classification rubric that already exists in `harness-router`
(`harness-router/SKILL.md:37-57`) but that no fleet currently consumes.

**Out of scope:** `bug-fleet` and `cicd-fleet` (already correctly run `harness-debugging`), every
non-build fleet, `harness-router` itself, and `harness-autopilot` / `harness-debugging` internals.
This change touches three files plus one ADR; it adds no product code and defines no new
taxonomy beyond what the router already carries.

## Decisions made

- **D1 — one canonical rubric (single source of truth).** The routing rubric is stated **once** in
  `docs/reference/fleet-family.md`; the two build-fleets reference it rather than each carrying a
  copy that can drift. This matches the family's existing "canonical statement, referenced not
  restated" discipline (e.g. ADR 0087/0088). _Rationale: two divergent copies of a routing rubric
  is exactly the drift the harness thesis exists to prevent._

- **D2 — a three-way target map (YAGNI-bounded).** The router's full taxonomy maps four scopes
  (`full-exploration`, `diagnostic`, `quick-fix`, `guided-change`). Autonomous fleets have no
  per-item human loop, so only three targets are load-bearing:
  `bug/diagnostic → harness-debugging`; `approved-spec → harness-autopilot`;
  `new-feature/ambiguous → harness-brainstorming → harness-autopilot`. `quick-fix → tdd` and
  `guided-change → planning` are deliberately dropped as speculative. _Rationale: every capability
  must trace to a stated requirement; the request is design-vs-debug awareness, not a full router
  port._

- **D3 — classify at SELECT, surface in CONFIRM, execute in DISPATCH, verify per-route in VERIFY.**
  Classification is a per-item property attached in SELECT (metadata-first, rubric-fallback), shown
  to the human in the CONFIRM batch as an overridable decision, executed as the routed pipeline in
  DISPATCH, and checked against route-appropriate artifacts in VERIFY. _Rationale: routing a wrong
  item wastes an entire lane; the family already gates once at CONFIRM, so surfacing the route there
  costs nothing and lets the human correct it before any work fans out — mirroring `bug-fleet`'s
  existing per-item CLASSIFY stage (`bug-fleet/SKILL.md:122-127`)._

- **D4 — additive, three-file blast radius.** Edits land in `fleet-family.md`,
  `roadmap-fleet/SKILL.md`, and `security-fleet/SKILL.md` only. The already-correct bug/cicd fleets
  and all non-build fleets are untouched. _Rationale: the reused skills (`harness-debugging`,
  `harness-autopilot`) already exist; only the fleets' dispatch/verify wiring needs the branch._

## Technical design

### The rubric (new `## Item-type routing` in `fleet-family.md`)

**Classification signal precedence — first match wins:**

1. **Explicit metadata.** A GH issue label (`bug`/`defect` → bug; `feature`/`enhancement` →
   feature) or a roadmap shard's kind/type field. Deterministic; trusted first.
2. **Spec presence.** The item already carries an approved spec (a roadmap `spec:` field that is
   non-null, or a linked `proposal.md`) → **spec-ready**. A spec that already exists means the
   design work is done — brainstorming would re-litigate a settled decision.
3. **Rubric fallback.** Apply `harness-router`'s scope rubric by judgment over the item text —
   diagnostic signals (broken, slow, failing, regression, error, crash) → **bug**; construction
   signals (build, add, design, new, support for) → **feature**; genuine ambiguity → **feature**
   (the safe default, because brainstorming can still decide an item needs no design and hand a
   spec straight to autopilot, whereas debugging cannot invent a design).

**Routing targets and route-dependent VERIFY artifact:**

| Route          | Pipeline                                    | VERIFY requires                                                                                                                                         |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bug**        | `harness-debugging`                         | committed `provenance.json` with `stages=[debugging]` **and** a committed reproducing test (fails-before / passes-after) — **not** a `plans/` directory |
| **spec-ready** | `harness-autopilot`                         | `plans/` directory + `provenance.json` with `stages` including `autopilot` (no `brainstorming` stage required)                                          |
| **feature**    | `harness-brainstorming → harness-autopilot` | `plans/` directory + `provenance.json` with `stages` including `brainstorming`, `autopilot` — _unchanged from today_                                    |

The debug-route artifact requirement mirrors `bug-fleet`'s existing proof-of-fix model (a reproducing
test that fails before and passes after — `bug-fleet/SKILL.md`), because a debugging run leaves no
`plans/` directory. Making VERIFY route-aware is what keeps the "no artifact ⇒ hand-patch ⇒ reject"
invariant honest across all three routes instead of rejecting every correctly-debugged item for
lacking a brainstorming artifact.

### Per-file edits

**`docs/reference/fleet-family.md`**

- Add a `## Item-type routing (build-shaped members)` section after "Shared design decisions",
  stating the rubric, the precedence, the spine placement, the route-dependent VERIFY artifact, and
  naming ADR 0103 as the canonical decision. Members reference it, they do not restate it.
- Update the Members table: the `roadmap-fleet` and `security-fleet` "Per-item pipeline" cells
  become "routed — see §Item-type routing" instead of a single hardcoded chain.
- Add ADR 0103 to the References list.

**`agents/skills/claude-code/roadmap-fleet/SKILL.md`**

- **SELECT** — add a classification step that attaches a `route` and a `routeSignal` (which
  precedence rule fired) to each `Candidate`; extend the `Candidate` record (`:59-72`) with those
  two fields.
- **CONFIRM** — add the per-item route to the presented batch (`:76-80`) as an **overridable**
  decision; the human may re-route any item before fan-out (a new fork class, recorded like any
  answered fork).
- **DISPATCH** — replace the hardcoded `harness-brainstorming then harness-autopilot` (`:88`) with
  "run the routed pipeline per §Item-type routing"; `provenance.json`'s `stages` reflect the route
  actually taken.
- **VERIFY** — make the required artifact route-dependent (`:112-116`): plan-artifact for
  feature/spec-ready, reproducing-test + `stages=[debugging]` provenance for bug.
- Update the Phase table row, Success Criteria, and Harness Integration (add a `harness-debugging`
  bullet).

**`agents/skills/claude-code/security-fleet/SKILL.md`**

- **SELECT** — classify each FIX-tier finding by route (a bounded vuln with a known remedy → bug;
  a fix requiring design → feature; a structural remedy already re-tiers to FILE and is unaffected).
- **DISPATCH** — FIX step (b) (`:114`) runs the routed fix pipeline instead of always
  `brainstorming → autopilot`; the regression-test step (c) applies to both routes.
- **VERIFY** — make the pipeline-artifact check (`:138`) route-dependent, exactly as in
  `roadmap-fleet`.
- Update the Members-row reference, Harness Integration (add `harness-debugging`), and Success
  Criteria.

## Integration points

- **Entry Points** — None new. The change is edits to two existing skills and one shared reference
  document; no new CLI command, MCP tool, skill, route, or barrel export.
- **Registrations Required** — None. The `cursor`/`codex`/`gemini-cli` skill mirrors are symlinks to
  the `claude-code` copy, so editing the `claude-code` `SKILL.md` propagates to all platforms; the
  gemini `.toml` regenerates via the pre-commit hook. No tier or route registration changes.
- **Documentation Updates** — `docs/reference/fleet-family.md` is updated as part of this change
  (it holds the canonical rubric). A new **ADR 0103** records the decision.
- **Architectural Decisions** — **ADR 0103, "Item-type routing for build-shaped fleet members."**
  Decisions D1–D3 collectively form a family-wide routing _policy_ — a peer of ADR 0087
  (execution architecture) and ADR 0088 (interaction model), which already codify family policies
  as referenced canonical statements. It warrants a single standalone ADR (not three) because the
  three decisions are one coherent policy that members reference as a unit.
- **Knowledge Impact** — introduces the "item-type routing" concept and the
  fleet → router-rubric reuse relationship into the knowledge graph.

## Success criteria

1. `roadmap-fleet` SELECT attaches a `route` to every `Candidate`, and a `bug`-labeled item routes
   to `harness-debugging` rather than `harness-brainstorming → harness-autopilot`.
2. `security-fleet` FIX tier routes a bounded, known-remedy vulnerability to `harness-debugging`.
3. An item that already carries an approved spec routes straight to `harness-autopilot`, skipping
   brainstorming.
4. VERIFY accepts a debug-routed item on `provenance(stages=[debugging])` plus a committed
   reproducing test, and does **not** reject it for lacking a `plans/` directory.
5. The routing rubric is stated exactly once, in `fleet-family.md`; `roadmap-fleet` and
   `security-fleet` reference it, with no divergent second copy.
6. `bug-fleet`, `cicd-fleet`, and every non-build fleet are unchanged by this change.
7. The human can override any item's route during the CONFIRM gate.
8. `harness skill validate roadmap-fleet`, `harness skill validate security-fleet`, and
   `harness validate` all pass after the edits.

## Implementation order

1. **Rubric + ADR.** Author ADR 0103; add the `## Item-type routing` section to `fleet-family.md`
   and update its Members table and References.
2. **`roadmap-fleet` wiring.** SELECT classification + `Candidate` fields → CONFIRM surfacing +
   override → DISPATCH routed pipeline → VERIFY route-aware artifact; update Phase table, Success
   Criteria, and Harness Integration.
3. **`security-fleet` wiring.** FIX-tier classification and routed pipeline, route-aware VERIFY,
   and the same integration/success updates.
4. **Validate.** `harness skill validate roadmap-fleet` + `harness skill validate security-fleet` +
   `harness validate`; confirm the symlink mirrors and the gemini `.toml` regeneration are clean.
