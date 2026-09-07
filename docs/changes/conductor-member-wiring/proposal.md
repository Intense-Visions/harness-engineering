# Conductor member wiring: make `perf-fleet` and `docs-fleet` schedulable

**Status:** proposed — awaiting human sign-off
**Sub-project:** SP2 of 3 (see _Scope boundary_)
**Keywords:** fleet-command, perf-fleet, docs-fleet, wave-dag, claim-lease, load-sensitive-evidence, conductor-tier, skill-manifest

## Overview

`fleet-command` cannot schedule two fully-built members of its own family.

`perf-fleet` and `docs-fleet` are installed, `stability: static`, `tier: 2`, `type: rigid`, and each exposes the `--report-only` and `--concurrency` seams the conductor requires of a member [evidence: `agents/skills/claude-code/perf-fleet/skill.yaml`, `agents/skills/claude-code/docs-fleet/skill.yaml`]. Neither appears in `fleet-command`'s `depends_on` [evidence: `agents/skills/claude-code/fleet-command/skill.yaml:68` — 11 members listed], its Provides roster [evidence: `.../fleet-command/SKILL.md:29` — the same 11 named], or its wave table [evidence: `.../fleet-command/SKILL.md:96-101` — waves 0-5].

The family spine already contradicts the conductor. `docs/reference/fleet-family.md:13` names `perf-fleet` among the members that work quality queues alongside the conveyor, and `:235` gives it a full member row (queue: _measured perf-budget violations + regressions_; pipeline: `perf` → `debugging`/`refactoring`). **The spine says member; the conductor's manifest says otherwise.**

A `fleet-command` run on 2026-09-06 could schedule neither member, consistent with their absence from `depends_on` and the wave table. (That run's report is not committed to this repository, so the defect is cited from the manifests themselves, which are independently checkable.)

A second instance of the same defect class sits one level down: `--lease-seconds` and `--no-claim` are documented in `fleet-command`'s Flags table [evidence: `.../fleet-command/SKILL.md:42-43`] and in the Flags tables of `roadmap-fleet`, `issue-fleet` and `pr-fleet`, but are declared in **no** `skill.yaml`.

### Goals

1. `perf-fleet` and `docs-fleet` become schedulable by `fleet-command` **when cap headroom exists**, and are named in the shed list with their reason when it does not (see D6 — this goal is deliberately conditional).
2. `perf-fleet`'s load-sensitive measurement is protected structurally, not by luck.
3. The claim-lease flags are declared wherever they are documented.
4. The family spine and the conductor manifest agree on the member roster — in **both** of the spine's rosters.

### Scope boundary

This is **SP2** of a three-way decomposition:

|         | Sub-project                                                                                                                                                         | Status        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| SP1     | Optimization discovery inside `perf-fleet` (a fifth SELECT source; admission rule relaxed from _measured violation_ to _measured before-state_, Iron Law unchanged) | separate spec |
| **SP2** | **This spec** — conductor member wiring                                                                                                                             | here          |
| SP3     | Make `cli.args` functional (`harness skill run` and MCP `run_skill` forward declared args)                                                                          | separate spec |

**This spec declares two flags that remain non-functional until SP3 lands.** `harness skill run` declares a fixed option set — `--path`, `--complexity`, `--phase`, `--party`, `--autonomous`, `--backend` — and rejects skill-declared args as unknown options [evidence: `packages/cli/src/commands/skill/run.ts`; no `allowUnknownOption` anywhere in `packages/cli/src`]. The MCP `run_skill` tool accepts `skill`, `path`, `complexity`, `phase`, `party`, `autoInject` [evidence: `packages/cli/src/mcp/tools/skill.ts:15-38`] — a richer shape than the CLI, but still with no passthrough for skill-declared `cli.args`. The agent-executed path honours the flags by instruction today, which is why the family works despite this. Stating the gap is a requirement of this spec, not a caveat on it.

**Why Edit 3 rides along.** Declaring the claim-lease flags on `roadmap-fleet`, `issue-fleet` and `pr-fleet` is not strictly conductor wiring — none of those members' schedulability depends on it. It is bundled here because it is the same defect (documented-but-undeclared) discovered in the same audit, the fix is four lines across three manifests, and splitting it would create a fourth sub-project whose entire content is a copy of Edit 1's second half. If a reviewer prefers it separate, it detaches cleanly: drop Edit 3 and criterion 6's member clause.

### Non-goals

- Making `cli.args` functional (SP3).
- Adding optimization-discovery capability (SP1).
- Changing `--max-fleets` or the shed rule (see D6).
- Changing any member's internal behaviour. This spec edits manifests, the conductor's wave table, and the spine rosters only.

## Decisions made

### D1 — `perf-fleet` gets an exclusive wave

`perf-fleet`'s verification bar is a measured before/after [evidence: `agents/skills/claude-code/perf-fleet/SKILL.md:7`], and its SELECT admits a target only with a measured violation recorded. Benchmarks taken while co-scheduled lanes saturate the machine are noise.

**Load-sensitive evidence is not new to this repository — silent corruption of it is.** `.husky/pre-push:84-85` already caps turbo at two packages at a time, with the stated reason: _"Without this, filesystem/sqlite/HTTP-heavy tests flake under compound parallel load."_ So test evidence is load-sensitive too, and the repo already spends throughput to protect it.

The distinction that justifies an exclusive wave is **failure mode, not novelty**:

- A contended **test** fails loudly. A flake is visible, reruns expose it, and the family already treats "prove the failure is outside your diff, then rerun once" as routine.
- A contended **benchmark** succeeds with a **plausible wrong number**. Nothing in the artifact distinguishes a clean 40ms from a contended 40ms. `perf-fleet` would then gate a fix on corrupted evidence and report it as verified — the failure the Iron Law exists to prevent, arriving through the one door the Iron Law cannot watch.

The four collision classes of the contention map all concern **shared write surfaces**; none covers measurement fidelity, which is invisible in a diff. Wave-separation is already this family's mechanism for "these must not run together" — the contention map's _allocated sequences_ class prescribes "Serialize the writers into different waves." D1 applies an established mechanism to a class the map does not yet name.

**Rejected — a measurement quiet-lock.** Schedule `perf-fleet` in wave 2 but let its measurement steps acquire a lock pausing other lanes' fan-out. Rejected on two grounds that actually distinguish it from D1: a lock held by a crashed lane deadlocks the run, where a wave barrier cannot; and nothing would record whether the quiet window was actually quiet, where a wave assignment is recorded in the run plan and visible at CONFIRM. (An earlier draft also objected that a lock adds cross-lane blocking to a "coordinator, never dictator" tier. That objection is withdrawn: the conductor already blocks lanes via wave barriers, serialization, and slot admission. An exclusive wave _is_ cross-lane blocking — coarser, and planned rather than dynamic.)

**Rejected — CI-side measurement.** Measure on CI runners so local concurrency is irrelevant. Rejected because per-measurement round-trip latency is minutes, which makes a measure → remediate → re-measure loop impractical inside a lane. Whether shared CI runners have better or worse benchmark variance than a quiet workstation is **not established here and is recorded as an open question**, not used as a reason. Revisit if benchmark stability proves inadequate even when `perf-fleet` runs alone.

### D2 — The fixed dependency shape extends to seven waves

```
0 CI trust gate · 1 ideate · 2 intake + sweeps · 3 decide · 4 build · 5 perf (exclusive) · 6 land
```

`perf-fleet` sits after build and before the lander so its fix PRs are landable in the same run. The terminal lander moves from wave 5 to wave 6. The invariant is _"the land stage runs last"_, not _"the land stage is wave 5"_; the index is incidental and is corrected, the invariant preserved.

**An exclusive wave is not a valid deferral target.** The contention map's deferral rule pushes a serialized lane into a later wave, bounded by "a deferral that would place a lane at or past the terminal lander's wave sheds that lane instead." Moving the lander to wave 6 nominally opens a wave of headroom, but wave 5 admits only `perf-fleet`. The terminal stop is therefore evaluated against **wave 5 — the first non-admitting wave** — not wave 6, so deferral behaviour is unchanged by the renumber. This must be stated beside the exclusivity rationale, and the two worked examples that reason about "the lander's wave 5" as the deferral stop must be reworked, not merely renumbered.

### D3 — `docs-fleet` is an ordinary wave-2 sweep

It reads standing code, none of its inputs come from a spine member, and its evidence is load-insensitive. No special handling; it joins the existing independent-sweep group.

### D4 — Flags are declared now, functional later

Declared in all four `skill.yaml`s despite `cli.args` being inert until SP3, because the documentation already promises them and the agent-executed path already honours them. **The spec states the gap explicitly** — declaring a flag the CLI silently ignores makes the contract _more_ wrong if left unsaid, which is the same defect this spec exists to fix.

### D5 — Both spine rosters gain the missing members

`docs/reference/fleet-family.md` carries **two** rosters: the sentence at `:13` and the per-member table at `:224-235`. The sentence names `perf-fleet` but not `docs-fleet`; the table has a row for every current member and none for `docs-fleet`. Fixing only the sentence would leave the same shape of disagreement this spec exists to close.

### D6 — `--max-fleets` stays at 6, and the resulting capacity limit is disclosed

`perf-fleet` remains sheddable. By input it is an independent quality sweep, so it is shed by depth like any other. An exclusive wave is not a reason to protect it: the trust gate and terminal lander are protected because dropping them costs the run its evidence base or its reviewable terminal state, and neither applies here. A shed `perf-fleet` empties wave 5, which the existing rule already handles — _"a wave with no scheduled members is skipped, not renumbered and not a barrier."_

**The capacity arithmetic, stated plainly.** Members the cap cannot shed are `cicd-fleet` (trust gate), `pr-fleet` (lander), and the four spine members `ideate` / `issue` / `adr` / `roadmap` (shed only on human trim at CONFIRM) — **six members against a default cap of six.** On a run where the whole spine has a non-empty queue, **every independent sweep is shed by construction**, including the two this spec wires in.

This is **pre-existing, not introduced here**: with 11 members the arithmetic was already six-versus-six. It stays invisible in practice because empty-queue members are unscheduled and do not consume cap.

The cap is left at 6 deliberately. It is a bound on authorized machine load, and widening it as a side effect of a wiring spec would be exactly the kind of unauthorized scope creep the conductor's own gates exist to refuse. Goal 1 is therefore **conditional by design**, and criterion 9 makes the conditional case verifiable: when the two members are shed, the report must name them with the depth that ordered the shed.

Two follow-ups are recorded rather than solved here: raising the cap with an argued number, and making the shed **cost-aware** — depth-ordered shedding cannot see that `perf-fleet` is now the single most expensive lane in a run, since it holds the whole slot pool for a wave of its own. A shallow-but-cheap sweep and a shallow-but-wave-exclusive one are ordered identically today. Both are changes to the shed rule itself and belong in their own spec.

## Technical design

**Source of truth:** `agents/skills/claude-code/<skill>/`. The `cursor`, `codex` and `gemini-cli` trees are symlinks to it [evidence: `agents/skills/{cursor,codex,gemini-cli}/fleet-command -> ../claude-code/fleet-command`], so one edit propagates to those mirrors. Plugin artifacts are generated for **five** targets — claude, cursor, gemini, codex, antigravity [evidence: `package.json:43-48`].

### Edit 1 — `agents/skills/claude-code/fleet-command/skill.yaml`

```yaml
depends_on: # 11 -> 13
  # ...existing 11...
  - perf-fleet # NEW
  - docs-fleet # NEW

cli:
  args: # 6 -> 8
    # ...existing 6...
    - name: --lease-seconds # NEW (declared; inert until SP3)
      description: Passed through verbatim to each ID-based member lane to override the cross-run claim-lease TTL
      required: false
    - name: --no-claim # NEW (declared; inert until SP3)
      description: Passed through verbatim to each ID-based member lane, disabling the cross-run claim lease for that run
      required: false
```

### Edit 2 — `agents/skills/claude-code/fleet-command/SKILL.md`

- **`:29`** Provides roster — add `perf-fleet` and `docs-fleet`.
- **`:96-101`** wave table — six rows become seven:

| Wave                     | Fleets                                                                                                       | Why this wave                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 0 — CI trust gate        | `cicd-fleet`                                                                                                 | unchanged                                                  |
| 1 — ideate               | `ideate-fleet`                                                                                               | unchanged                                                  |
| 2 — intake + sweeps      | `issue-fleet`; `test-fleet`, `cleanup-fleet`, `bug-fleet`, `security-fleet`, `craft-fleet`, **`docs-fleet`** | `docs-fleet` joins as an ordinary sweep (D3)               |
| 3 — decide               | `adr-fleet`                                                                                                  | unchanged                                                  |
| 4 — build                | `roadmap-fleet`                                                                                              | unchanged                                                  |
| **5 — perf (exclusive)** | **`perf-fleet`**                                                                                             | **silently-corruptible evidence; never co-scheduled (D1)** |
| 6 — terminal             | `pr-fleet`                                                                                                   | lands what every other lane produced (renumbered from 5)   |

- Add a rationale paragraph beside the table, in the voice of the existing wave-0 trust-gate note, stating why wave 5 is exclusive **and** that an exclusive wave is not a valid deferral target (D2).
- Rework the two worked examples that reason about "the lander's wave 5" as the deferral stop — renumbering alone would leave their reasoning wrong.
- Sweep the body for prose asserting wave 5 is terminal.

### Edit 3 — member manifests

Declare `--lease-seconds` and `--no-claim` in `agents/skills/claude-code/{roadmap-fleet,issue-fleet,pr-fleet}/skill.yaml`, matching the descriptions already in each member's Flags table.

### Edit 4 — `docs/reference/fleet-family.md`

- **`:13`** — add `docs-fleet` to the roster sentence.
- **`:224-235`** — add a `docs-fleet` member row: stage `—`; queue: doc-drift / undocumented backlog; pipeline: `harness-docs-pipeline --fix` to convergence; terminal act: scoped doc-fix PRs [source: `agents/skills/claude-code/docs-fleet/SKILL.md:3`].

### Edit 5 — regenerate platform artifacts

Run `pnpm generate:plugin:all` (which invokes `harness generate-slash-commands` via `scripts/generate-plugin.mjs:104`) across all five targets. The drift gate is `.husky/pre-commit:141-146`, which fires only when `agents/skills/` or `scripts/generate-plugin*` is **staged**, and which **auto-regenerates and `git add`s** rather than failing the commit. `.husky/pre-push` does **not** check plugin or command artifacts.

### What does not change

No CLI command, MCP tool, barrel export, route, or tier assignment. No member's internal phases, gates or Iron Law. `perf-fleet`'s SELECT is untouched (that is SP1's subject). `--max-fleets` and the shed rule are unchanged (D6).

## Integration points

### Entry points

No new CLI command, MCP tool, skill, or API route. One new **scheduling** entry point: wave 5 admits a lane exclusively — the first wave in the family with an occupancy constraint, and the first that is not a valid deferral target.

### Registrations required

1. **Wave table entry** (`fleet-command/SKILL.md:96-101`) — the operative wiring. The conductor derives waves from the fixed dependency shape stated as prose in its own body, which the agent reads; without a row here the members have no derived wave regardless of the manifest.
2. **`depends_on` += `perf-fleet`, `docs-fleet`** — manifest/index consistency. Consumed by the skill index [evidence: `packages/cli/src/skill/index-builder.ts:98`] and read by the recommendation and dispatch engines for ordering. Without it the members are absent from the skill index's dependency view and the manifest disagrees with the body.
3. **`pnpm generate:plugin:all`** — regenerates command files for all five targets.
4. No barrel export, route registration, or tier change — both members are already `tier: 2`.

### Documentation updates

- `fleet-command/SKILL.md` — Provides roster, wave table, exclusivity + deferral-target rationale, worked-example rework, wave 5 → 6 renumber.
- `docs/reference/fleet-family.md` — roster sentence `:13` and member table `:224-235`.
- Any ADR, reference page or run report citing "wave 5 = terminal".

### Architectural decisions

**D1 warrants a standalone ADR (next free number: 0125 — 0124 is the highest on `origin/main`).** It establishes a scheduling constraint the contention map does not cover: the map's four classes all concern shared write surfaces, whereas D1 serializes on **measurement fidelity**. The ADR's value is the failure-mode distinction, not a novelty claim — this repo already protects load-sensitive test evidence at `.husky/pre-push:84-85`; what is new is evidence whose corruption is **silent**, producing a plausible wrong number rather than an exposable flake. Any future member with silently-corruptible evidence inherits this precedent.

D2-D6 are mechanical consequences or bounded policy calls and do not warrant standalone ADRs.

### Knowledge impact

One new domain concept: **silently-corruptible evidence** as a scheduling constraint, distinct from the contention map's four write-surface collision classes. Relationships: `perf-fleet --requires--> exclusive-wave --because--> measurement-fidelity`; `exclusive-wave --is-not--> valid-deferral-target`.

## Success criteria

1. A `/harness:fleet-command --report-only` run prints a run plan enumerating **13** installed members, deriving `perf-fleet` to wave 5 and `docs-fleet` to wave 2. (The agent-executed path is named deliberately: `harness skill run` cannot carry skill-declared flags until SP3, and only prints SKILL.md with a context preamble rather than executing SELECT.)
2. `perf-fleet` and `docs-fleet` appear in that plan either as scheduled lanes or in the shed list **with a reason** — never absent.
3. When `perf-fleet` is scheduled, the run report **records wave 5 as exclusive and names `perf-fleet` as its sole occupant**.
4. When `perf-fleet` is unscheduled or shed, **wave 5 is skipped rather than renumbered**, and `pr-fleet` still occupies wave 6.
5. `pr-fleet` is the terminal member at wave 6, and no prose in `fleet-command/SKILL.md` asserts wave 5 is terminal. The two worked examples reason about the deferral stop against wave 5 as the first non-admitting wave.
6. `fleet-command`, `roadmap-fleet`, `issue-fleet` and `pr-fleet` each **declare** `--lease-seconds` and `--no-claim`, and regenerated command files list them.
7. **Both** `fleet-family.md` rosters — the `:13` sentence and the `:224-235` member table — name all 13 members, and the set matches `fleet-command`'s `depends_on` exactly.
8. `pnpm generate:plugin:check` exits 0 with no working-tree diff in `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`.
9. When `perf-fleet` or `docs-fleet` is shed by the cap, the report names it **with the probed depth that ordered the shed**, proving it entered the shed ordering rather than being invisible to it.

**Explicitly not claimed:**

- The two newly-declared flags remain non-functional through `harness skill run` and MCP `run_skill` until SP3. Criterion 6 tests declaration, not behaviour.
- **Wave-5 occupancy is an assumption, not a verified check.** No artifact records which lanes were in fan-out during a wave, exactly as none records a lane's peak concurrency. Criterion 3 tests only what the report states; the guarantee that no other lane was admitted is dispatch-time-enforced and recorded in the run's assumptions-made note, in the same terms the conductor already uses for allocation.

## Implementation order

**Phase 1 — Manifests.** `depends_on` += 2; declare 4 flags across 4 `skill.yaml`s; `pnpm generate:plugin:all`.
_Verifiable:_ criterion 6, criterion 8.

**Phase 2 — Wave table, exclusivity, deferral rule.** Rewrite the table to seven waves; add the exclusivity + deferral-target rationale; rework the two worked examples; renumber terminal; sweep prose.
_Verifiable:_ criterion 5.

**Phase 3 — Spine reconciliation.** Both `fleet-family.md` rosters.
_Verifiable:_ criterion 7.

**Phase 4 — ADR 0125.** Record silently-corruptible evidence as a scheduling constraint, at `status: proposed`.
_Verifiable:_ ADR exists; re-read the written file to confirm the `decision` field survived and `source:` is quoted — both are known `manage_adr` write defects (#1849).

**Phase 5 — Verify by running it.** Execute the conductor `--report-only` and confirm criteria 1-9. Criteria 3 and 4 need one run with `perf-fleet` scheduled and one without.

## Risks and open questions

- **Renumber churn.** Wave 5 → 6 invalidates external citations of the terminal index. Mitigated by the Phase 2 sweep; citations outside this repository cannot be swept.
- **Exclusive-wave cost.** A run scheduling `perf-fleet` is one wave longer and that lane holds the full slot pool alone. Accepted (D1).
- **Goal 1 is conditional.** On a full-spine run the cap sheds both new members (D6). Disclosed and made verifiable by criterion 9 rather than solved.
- **Shed ordering is cost-blind.** Depth-ordered shedding cannot see that `perf-fleet` is the most expensive lane in a run. Recorded as a follow-up.
- **Open:** whether `perf-fleet` running alone on a developer workstation is quiet enough for stable benchmarks. D1 removes conductor-induced contention; it does not make the machine idle.
- **Open:** whether shared CI runners have better or worse benchmark variance than a quiet workstation. Unmeasured. Deliberately not used as a reason to reject CI-side measurement.
