# Plan: Trusted Autonomy Mode — Phase 4 (Docs, ADRs, knowledge)

**Date:** 2026-11-13 | **Spec:** `docs/changes/trusted-autonomy-mode/proposal.md` | **Tasks:** 8 | **Time:** ~32 min | **Integration Tier:** large | **Rigor:** standard

## Goal

Everything Phases 1–3 shipped is documented as it actually shipped: three ADRs, an AGENTS.md subsection, an operator guide, a knowledge node, and three carry-forward Pause Protocol wording fixes, with `harness validate` held at its 496 baseline.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/decisions/` holds three new ADRs at the next three free numbers (expected `0136`, `0137`, `0138`; re-checked against `origin/main` at execution) with frontmatter `status: accepted`, `tier: large`, `source: docs/changes/trusted-autonomy-mode/proposal.md`, and `## Context` / `## Decision` / `## Consequences` / `## References` sections.
2. If the validate run is repeated after the ADRs land, then `harness validate --json` shall not report more than 1 `ADR-NUM-DUP` issue (the pre-existing one) or more than 496 issues in total.
3. AGENTS.md has a `### Autonomy` subsection under `## Key Concepts` that links the guide, the knowledge node, the three ADRs, `agents/skills/templates/pause-protocol.md`, and names `harness autonomy show|set|log`.
4. `docs/guides/trusted-autonomy.md` exists and covers: enabling via `~/.harness/config.json`, headless use, `harness autonomy set` (TTY, `--for`, session-bound), lowering flags, `harness autonomy log`, what still pauses, the threat model, and known limitations (including the persona-subagent finding below). It is listed in `docs/.vitepress/config.mts` (Guides sidebar) and `docs/guides/index.md`.
5. `docs/knowledge/core/autonomy.md` exists in the sibling format (frontmatter `type: business_concept`, `domain: core`) and links every autonomy source file by relative path.
6. `harness check-docs --json` lists none of the 12 currently undocumented autonomy files under `undocumented` (today: `types/src/autonomy.ts`, core `summary.ts`, `session.ts`, `resolve.ts`, `override-store.ts`, `lower-only.ts`, `decision-schema.ts`, `decision-log.ts`, cli `hooks/autonomy-guard.js`, `mcp/tools/auto-decision.ts`, `commands/autonomy/set.ts`, `commands/autonomy/deps.ts`), and `brokenLinks` gains no entry.
7. The blind auditor template contains `Read only the paths listed under Evidence; do not open files under \`.harness/\` or any \`interview.md\`.`and`blindLeaks`stays`[]`.
8. `## Resolving a pause point` states that "delete" means branches, issues or remote resources (not local scratch files) and that existing roadmap sync steps are not new `irreversible` pauses; the I1c round-up applies only to a choice between alternatives the skill explicitly enumerated.
9. `cd agents/skills && npx vitest run tests/pause-protocol.test.ts tests/pause-markers.test.ts` passes; `pnpm run generate-docs -- --check` (or its equivalent no-diff run) exits 0.

## NFR Targets

Not elicited: docs-only phase with no hot path, no new input surface and no new failure mode. All four dimensions take the default (see the Uncertainties list). No NFR tasks.

## Uncertainties

- [ASSUMPTION] ADR numbers 0136–0138 are free. `git ls-tree origin/main docs/knowledge/decisions/` tops out at 0135 today (2026-11-13). Task 2 re-checks; if taken, shift all three and every reference in Tasks 5–7.
- [ASSUMPTION] Persona subagents cannot call MCP tools or spawn subagents. Evidence: `packages/cli/src/agent-definitions/generator.ts:33` (`DEFAULT_TOOLS = ['Bash','Read','Write','Edit','Glob','Grep']`) and `:70` (every persona gets `[...DEFAULT_TOOLS]`); all 16 `.claude-plugin/agents/*.md` carry `tools: Bash, Read, Write, Edit, Glob, Grep`; the harness-planner subagent writing this plan had exactly those tools and no MCP tool. That an explicit `tools:` list excludes MCP tools unless named (`mcp__<server>__<tool>`) is [UNVERIFIED] against current Claude Code docs: Task 6 verifies it via context7 before writing the limitation.
- [ASSUMPTION] The existing `.changeset/trusted-autonomy-mode.md` (types/core/cli minor) covers the template wording change; no new changeset.
- [ASSUMPTION] New markdown under `docs/` does not change the validate count (the 496 is DRIFT-T*/RMH*/1 ADR-NUM-DUP). Each task re-measures.
- [DEFERRABLE] Exact prose of ADRs and guide beyond the mandatory facts listed per task.

## Persona-subagent finding (scope item 6)

The two personas autopilot dispatches for PLAN and EXECUTE (`harness-planner`, `harness-task-executor`, `agents/skills/claude-code/harness-autopilot/SKILL.md:17-18`) are generated with a fixed six-tool allow-list. Under the Pause Protocol this means, inside those subagents:

- `gather_context({ include: ["autonomy"] })` is unreachable → fail-safe "cannot resolve autonomy" → **pause** at every ceremony/judgment point (protocol rule 4).
- `record_auto_decision` is unreachable → even with autonomy resolved, rule 7 → **pause**.
- No subagent-spawning tool → audit would be `unavailable` (D11), but the run never gets that far.
- A "pause" in a dispatched subagent is a plain-text question returned to the dispatching agent, not to the human.

Net effect: trusted mode degrades to supervised behaviour inside autopilot's PLAN and EXECUTE subagents (it fails safe, not open). Goal 1 holds for skills run in the main session, not for persona-dispatched phases. The fix (extend `DEFAULT_TOOLS` or per-persona `tools` with the harness MCP tools and a spawn tool, then regenerate) is code, outside this docs phase; see Concerns.

## File Map

- MODIFY `agents/skills/templates/pause-protocol.md`
- MODIFY `agents/skills/tests/pause-protocol.test.ts`
- CREATE `docs/knowledge/decisions/0136-autonomy-is-orthogonal-to-rigor.md`
- CREATE `docs/knowledge/decisions/0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md`
- CREATE `docs/knowledge/decisions/0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md`
- CREATE `docs/knowledge/core/autonomy.md`
- CREATE `docs/guides/trusted-autonomy.md`
- MODIFY `docs/.vitepress/config.mts`
- MODIFY `docs/guides/index.md`
- MODIFY `AGENTS.md`
- MODIFY (only if drift) `docs/reference/*` via `pnpm run generate-docs`

## Skeleton

1. Carry-forward protocol wording with tests (1 task, ~5 min)
2. Three ADRs (3 tasks, ~12 min)
3. Knowledge node, guide + nav, AGENTS.md (3 tasks, ~11 min)
4. Generation and verification gates (1 task, ~4 min)

_Skeleton approved: not separately — the coordinator asked for a compact single-pass plan; the skeleton is presented with the full plan for one combined sign-off._

## Conventions for every task

- Validate gate: `harness validate --json > "$SCRATCH/v.json"; python3 -c "import json;i=json.load(open('$SCRATCH/v.json'))['issues'];print(len(i), sum(1 for x in i if x['ruleId']=='ADR-NUM-DUP'))"` must print `496 1` (`$SCRATCH` = the session scratchpad).
- Format every touched markdown file with `npx prettier --write <files>` and re-read the diff (prettier has corrupted underscores and table rows in this feature before).
- Before committing, restore tool artifacts if dirtied: `git checkout -- .harness/security/timeline.json packages/cli/.harness/.gitignore` and `rm -rf agents/skills/.harness`.
- Never push. Do not touch roadmap files.

## Tasks

### Task 1: Carry-forward Pause Protocol wording (I5 template, I3b scope, I1c scope)

**Depends on:** none | **Files:** `agents/skills/templates/pause-protocol.md`, `agents/skills/tests/pause-protocol.test.ts`

1. In `agents/skills/tests/pause-protocol.test.ts`, describe `re-review I5`, first `it`: replace the expected string with
   `'Read only the paths listed under Evidence; do not open files under \`.harness/\` or any \`interview.md\`.'`(keep the`blindLeaks(...)).toEqual([])` line).
2. In describe `review I3`, inside `it('rounds a pause up to the class of its action'`, after the existing I3b `toContain`, add:
   ```ts
   // Phase 4 carry-forward: narrow "delete" and keep existing roadmap sync out of the irreversible class (SC10)
   expect(section('## Resolving a pause point')).toContain(
     'Here "delete" means deleting branches, issues, or remote resources, not local scratch files.'
   );
   expect(section('## Resolving a pause point')).toContain(
     'The roadmap sync steps a skill already performs (`manage_roadmap` `sync`) are not new `irreversible` pauses; run them as the skill text says.'
   );
   ```
3. In describe `re-review I1a-c`, replace the I1c `it` body with:
   ```ts
   const s = section('## Resolving a pause point');
   expect(s).toContain(
     'A ceremony that approves content embedding a choice between alternatives the skill explicitly enumerated (for example approaches A, B and C in a spec section) that no judgment fork settled is `judgment`.'
   );
   expect(s).toContain(
     'Approving a spec, plan or section that embeds no such enumerated choice stays `ceremony`.'
   );
   expect(s).not.toContain('an option choice not settled through a judgment fork');
   ```
4. Run `cd agents/skills && npx vitest run tests/pause-protocol.test.ts` — expect exactly these 3 cases to FAIL.
5. Edit `agents/skills/templates/pause-protocol.md`:
   - Line 107 (inside ` ```blind-audit-prompt `): `Do not open files under \`.harness/\` or any \`interview.md\`.`→`Read only the paths listed under Evidence; do not open files under \`.harness/\` or any \`interview.md\`.`
   - Line 36: after the sentence ending `including commands inside a plan task.` insert ` Here "delete" means deleting branches, issues, or remote resources, not local scratch files. The roadmap sync steps a skill already performs (\`manage_roadmap\` \`sync\`) are not new \`irreversible\` pauses; run them as the skill text says.`and replace the final sentence`A ceremony that approves content containing an option choice not settled through a judgment fork is \`judgment\`.`with`A ceremony that approves content embedding a choice between alternatives the skill explicitly enumerated (for example approaches A, B and C in a spec section) that no judgment fork settled is \`judgment\`. Approving a spec, plan or section that embeds no such enumerated choice stays \`ceremony\`.`
6. Run `cd agents/skills && npx vitest run tests/pause-protocol.test.ts tests/pause-markers.test.ts` — all pass.
7. Mutation probe: revert only the line-107 edit (scratch copy of the file first), rerun `tests/pause-protocol.test.ts`, confirm the I5 case fails, restore from the scratch copy, rerun green.
8. `npx prettier --check agents/skills/templates/pause-protocol.md agents/skills/tests/pause-protocol.test.ts`; validate gate (`496 1`).
9. Commit: `docs(skills): pause protocol scopes delete, roadmap sync and the I1c round-up; blind auditor reads only Evidence`

### Task 2: ADR 0136 — autonomy is orthogonal to rigor

**Depends on:** none | **Files:** `docs/knowledge/decisions/0136-autonomy-is-orthogonal-to-rigor.md`

1. `git fetch origin && git ls-tree --name-only origin/main docs/knowledge/decisions/ | tail -3` and `ls docs/knowledge/decisions | tail -3`. If 0136 exists in either, renumber this task and Tasks 3–4 upward and record the new numbers for Tasks 5–7.
2. Create the file with frontmatter:
   ```yaml
   ---
   number: 0136
   title: 'Autonomy is orthogonal to rigor: --fast no longer auto-approves'
   date: 2026-11-13
   status: accepted
   tier: large
   source: docs/changes/trusted-autonomy-mode/proposal.md
   ---
   ```
3. Sections (follow ADR 0135's "Record of an operative decision" opening blockquote, naming spec **D2** and decision **D-D**/**D-E** from Phase 3):
   - **Context:** before this feature `--fast` coupled fewer pauses with less verification (spec D2 cites `harness-autopilot/SKILL.md:104-114,:174` as of the spec); the user asked for the first only.
   - **Decision:** autonomy (`supervised|trusted`) decides who decides at a pause; `rigorLevel` decides how much is checked. Fast APPROVE_PLAN uses the same signals as standard and is a `ceremony` pause (D-D, `harness-autopilot/SKILL.md:117,:199`); thorough forced review is a forced `ceremony` pause (D-E); with `reviewPlans: true` plan approval never auto-resolves (D-H).
   - **Consequences:** SC10 behaviour change for supervised `--fast` users (they now get a plan-approval and INTEGRATE pause); trusted mode is the supported way to skip them; rigor semantics unchanged.
   - **References:** spec D2/SC10; `agents/skills/templates/pause-protocol.md`; Phase 3 plan decisions table.
4. `npx prettier --write` the file; validate gate (`496 1`).
5. Commit: `docs(adr): 0136 autonomy is orthogonal to rigor`

### Task 3: ADR 0137 — the user-level trust boundary

**Depends on:** Task 2 | **Files:** `docs/knowledge/decisions/0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md`

1. Frontmatter as Task 2 with `number: 0137`, `title: 'Autonomy trust boundary: user-level only, raised only by the human, every agent- or repo-reachable path lower-only'`.
2. Mandatory facts (each with a citation):
   - Precedence: the more recent of {flag, session override} > `HARNESS_AUTONOMY*` env > `~/.harness/config.json` > `supervised` (D3); `resolveAutonomy` never reads `harness.config.json` (SC5; `packages/core/src/autonomy/resolve.ts:252`).
   - Lower-only tiers: env (D13: `.env`, `.mcp.json`, `.claude/settings.json` env blocks are repo-reachable), flags (D17: `--trusted`/`--no-audit` refused), and `manage_state set-autonomy` (D12; `packages/core/src/autonomy/lower-only.ts:25` `writeLoweringOverride`, `AUTONOMY_RAISE_REJECTED`).
   - Raise paths: only `~/.harness/config.json` or `harness autonomy set` with both stdin and stdout a TTY plus interactive confirm (`packages/cli/src/commands/autonomy/set.ts:37`).
   - Overrides in home, never the repo: `~/.harness/session-overrides/<repoKey>/<slug>.json` (D12), `repoKey` = sha256 of realpath of `git rev-parse --git-common-dir`, first 16 hex, shared across worktrees (D15; `paths.ts:93`); per-field `setAt`.
   - Raises bound to an existing session dir and expiring (D14; default 24h, `override-store.ts:27`, `--for`); lowerings permanent.
   - Threat model (spec `#threat-model`): protects against injected instructions, repo-carried config, accidental raises; NOT a sandbox against same-user code. Residual narrowed by the `autonomy-guard` PreToolUse hook (D16; in the `minimal` profile, `packages/cli/src/hooks/profiles.ts:5`) and made visible by `~/.harness/autonomy-audit.log` (`paths.ts:29`).
   - Rejected: project-level setting (a cloned repo could raise); raising env/flags (agent cannot prove a human typed it); overrides under `.harness/sessions/` (gitignored here, not in scaffolded templates).
   - Consequences: headless trusted runs must configure the host's `~/.harness/config.json`; a tripwire, not a sandbox; no project cap in v1 (D4), addable later without a trust change.
3. `npx prettier --write`; validate gate (`496 1`).
4. Commit: `docs(adr): 0137 autonomy trust boundary is user-level and raise-only by the human`

### Task 4: ADR 0138 — blind-then-refute self-audit

**Depends on:** Task 3 | **Files:** `docs/knowledge/decisions/0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md`

1. Frontmatter as Task 2 with `number: 0138`, `title: 'Auto-resolved judgment forks pass a blind-then-refute self-audit; disagreement is the only judgment pause that survives trusted mode'`.
2. Mandatory facts (cite `agents/skills/templates/pause-protocol.md` section names, not line numbers):
   - D7 blind re-derivation (auditor never sees recommendation or rationale; options label-stripped, alphabetised, numbered) then a refuter only on agreement; D8 disagreement or a `blocking` objection escalates at every autonomy level; D9 audit default on in trusted, opt-in in supervised; D11 `unavailable` only when the host has no spawning tool.
   - Phase 3 review hardening: pre-audit commitment line printed before the spawn; exactly one auditor and at most one refuter, never re-run (a second spawn is a disagreement); `unavailable` decided once at skill start; on a spawning host, a spawn error, non-JSON reply or non-verbatim pick is a disagreement; classes only round up (irreversible/gate actions win over any marker, including unmarked irreversible actions inside plan tasks); markers honoured only from SKILL.md and their generated copies; auditor evidence excludes `.harness/`, any `interview.md` and files written for this pause, and the auditor reads only the Evidence paths (Task 1); prompts and raw replies saved under `.harness/sessions/<slug>/audits/`.
   - Log contract: `record_auto_decision` refuses entries in supervised mode (`packages/core/src/autonomy/decision-log.ts:258-301`); `harness autonomy log` reports `audited N/M` with M counting `unavailable`/`off` (SC9); an unlogged decision is never taken (SC14).
   - Consequences: compliance is instruction-level (D5), proven by `agents/skills/tests/pause-protocol.test.ts` and `pause-markers.test.ts` only as text; headless disagreements go to handoff `blockers` and nothing pages a human (Future Consideration); audits cost two subagent spawns per auto-resolved fork; persona subagents cannot spawn today (see the guide's limitations).
3. `npx prettier --write`; validate gate (`496 1`).
4. Commit: `docs(adr): 0138 blind-then-refute self-audit for auto-resolved judgment forks`

### Task 5: Knowledge node `docs/knowledge/core/autonomy.md`

**Depends on:** Tasks 2, 3, 4 | **Files:** `docs/knowledge/core/autonomy.md`

1. Frontmatter (format of `docs/knowledge/core/parallelization-plan.md`):
   ```yaml
   ---
   type: business_concept
   domain: core
   tags: [autonomy, trusted-mode, pause-protocol, pause-class, self-audit, auto-decision-log]
   ---
   ```
2. Sections: `# Autonomy`, `## What it is` (concepts **autonomy level**, **pause class**, **self-audit agreement rate**), `## Relationships`, `## Source map`, `## See also`.
3. `## Source map` is a list of markdown links (relative from `docs/knowledge/core/`) to every file below, one line each with a one-clause role — these links are what lift doc coverage:
   `../../../packages/types/src/autonomy.ts`, `../../../packages/core/src/autonomy/{index,schema,paths,resolve,session,lower-only,override-store,decision-schema,decision-log,summary}.ts`, `../../../packages/cli/src/commands/autonomy/{index,show,set,log,deps}.ts`, `../../../packages/cli/src/mcp/tools/auto-decision.ts`, `../../../packages/cli/src/hooks/autonomy-guard.js`, `../../../agents/skills/templates/pause-protocol.md` (expand the braces into separate links).
4. `## See also`: ADRs 0136–0138 (relative links), `../../guides/trusted-autonomy.md`, the spec.
5. Verify every link resolves: `cd docs/knowledge/core && grep -o '](\.\./[^)]*)' autonomy.md | sed 's/](\(.*\))/\1/' | while read p; do [ -e "$p" ] || echo MISSING $p; done` prints nothing (the guide link may report MISSING until Task 6; re-run there).
6. `npx prettier --write`; validate gate (`496 1`).
7. Commit: `docs(knowledge): autonomy business-concept node`

### Task 6: Operator guide + nav

**Depends on:** Tasks 1, 5 | **Files:** `docs/guides/trusted-autonomy.md`, `docs/.vitepress/config.mts`, `docs/guides/index.md`

1. Verify the persona assumption first: context7 `resolve-library-id` "Claude Code", `query-docs` "subagent tools field allow-list MCP tools inheritance". Record the answer; if an explicit `tools:` list DOES inherit MCP tools, rewrite limitation bullet 2 below accordingly and tell the coordinator.
2. Create the guide, header style of `docs/guides/comprehension-substrate.md` (H1, one-line blockquote, intro). Sections and mandatory content:
   - **Enabling:** `~/.harness/config.json` example `{ "autonomy": { "level": "trusted", "audit": { "trusted": true, "supervised": false } } }`; a project `harness.config.json` key is ignored; malformed file → defaults + one warning.
   - **One session:** `harness autonomy set trusted --session <slug> [--for 2h]` needs an interactive TTY and confirm, an existing `.harness/sessions/<slug>/`, defaults to 24h; lowering (`supervised`, `--audit on`) is permanent and also available to agents.
   - **Headless / CI / orchestrator:** env and flags can only lower; set `~/.harness/config.json` on the host.
   - **Lowering flags:** `--supervised`, `--audit` on Tier-1 workflow skills; `--trusted`/`--no-audit` refused with the raise hint.
   - **What still pauses:** `irreversible` (merge, push, open PR, delete branches/issues/remote resources, publish, force-push; not existing roadmap sync), `gate` (red verify, `NOT_SATISFIED`, blocking findings, dependency cycles, strategy contradictions, human-only steps, taint/`--no-verify`/protect-config), audit disagreements, and every fail-safe (no recommendation, unmarked, no session, failed log write).
   - **Reading the log:** `harness autonomy log --session <slug>`: counts by class, `audited N/M`, agreement rate, escalations; prompts and replies under `.harness/sessions/<slug>/audits/`; `harness autonomy show` for resolved value + source.
   - **Threat model in plain words:** stops injected text and cloned repos from raising; not a sandbox against same-user code; `autonomy-guard` hook and `~/.harness/autonomy-audit.log`.
   - **Known limitations:** (1) compliance is instruction-level; (2) persona subagents (`harness-planner`, `harness-task-executor`, all 16 generated agents) have a fixed `Bash, Read, Write, Edit, Glob, Grep` allow-list (`packages/cli/src/agent-definitions/generator.ts:33,:70`), so inside them autonomy cannot be read and the log cannot be written → every ceremony/judgment pause fails safe and returns to the dispatching agent; audits there would be `unavailable`; trusted mode effectively applies to main-session skills only until the tool list is extended; (3) headless disagreements land in handoff `blockers`, nothing pages a human; (4) the sentinel injection scanner (INJ-UNI-001) flags U+200C/U+200D, so a log entry with Persian text or an emoji ZWJ sequence echoed back can taint the session.
   - Links to the three ADRs, `../knowledge/core/autonomy.md`, the protocol, `hooks-system.md#autonomy-guardjs`.
3. `docs/.vitepress/config.mts`: in the `'/guides/'` items array add `{ text: 'Trusted Autonomy', link: '/guides/trusted-autonomy' }` after the Comprehension Substrate entry (add the trailing comma to that entry).
4. `docs/guides/index.md`: add a `### [Trusted Autonomy](./trusted-autonomy.md)` entry after the Agent Worktree Patterns entry, in the same shape (2-4 bullets + `**Best for:**` line).
5. Re-run Task 5 step 5's link check (now no MISSING) and the same check for the guide.
6. `npx prettier --write docs/guides/trusted-autonomy.md docs/guides/index.md`; `npx prettier --check docs/.vitepress/config.mts`; validate gate (`496 1`).
7. Commit: `docs(guides): trusted autonomy operator guide`

### Task 7: AGENTS.md Autonomy subsection

**Depends on:** Tasks 5, 6 | **Files:** `AGENTS.md`

1. Insert `### Autonomy` under `## Key Concepts`, immediately before `### Result<T, E> Pattern` (after `### Compiled comprehension substrate`). Concise (≤ 20 lines): one-paragraph definition (who decides vs rigor's how much is checked; `supervised|trusted`; four pause classes); bullets for **Raising** (only `~/.harness/config.json` or TTY-confirmed `harness autonomy set`; flags/env/MCP/repo lower-only), **Still pauses** (irreversible, gate, audit disagreement, strategy contradiction), **Audit + log** (blind-then-refute; `harness autonomy show|set|log`; `.harness/sessions/<slug>/auto-decisions.jsonl`), **Limitation** (persona subagents fail safe, see guide), and **See** (guide, `docs/knowledge/core/autonomy.md`, ADRs 0136–0138, `agents/skills/templates/pause-protocol.md`). Note the naming clash: unrelated to the roadmap auto-triage `ratchetStage` "autonomy".
2. `npx prettier --write AGENTS.md`; `git diff AGENTS.md` shows only the insertion; validate gate (`496 1`).
3. Commit: `docs: add Autonomy to AGENTS.md key concepts`

### Task 8: Generation and verification gates

[checkpoint:human-verify] — show the coordinator the three ADR titles, the guide's "Known limitations" section, and the gate results below before declaring Phase 4 done.

**Depends on:** Task 7 | **Files:** `docs/reference/*` (only if regeneration produces a diff)

1. `pnpm run generate-docs`; if `git status --short docs/reference` shows changes, review and commit them as `docs(reference): regenerate`; otherwise nothing to commit.
2. `harness check-docs --json > "$SCRATCH/docs.json"` and assert none of the 12 files in Observable Truth 6 appear under `undocumented`, and `brokenLinks` contains no path under `docs/guides/trusted-autonomy.md`, `docs/knowledge/core/autonomy.md` or the new ADRs. Positive control: the same script must still find `packages/core/src/autonomy/resolve.ts` under `documented`.
3. Validate gate prints `496 1`; `harness check-deps` exits 0.
4. `cd agents/skills && npx vitest run` (full skills suite, expect ≥ 34612 pass); `pnpm run generate:barrels:check` exits 0.
5. `git status --short` is clean after the artifact restores in Conventions.
6. Write handoff `.harness/sessions/changes--trusted-autonomy-mode--proposal/handoff.json` (`fromSkill: harness-execution`, `phase: phase-4`).

## Traceability

| Truth | Tasks   |
| ----- | ------- |
| 1     | 2, 3, 4 |
| 2     | 2-4, 8  |
| 3     | 7       |
| 4     | 6       |
| 5     | 5       |
| 6     | 5, 8    |
| 7, 8  | 1       |
| 9     | 1, 8    |

## Concerns

1. **Trusted mode does not reach persona subagents.** All 16 generated personas, including the PLAN/EXECUTE ones autopilot dispatches, get a fixed six-tool list (`generator.ts:33,:70`), so autonomy and the decision log are unreachable there and every ceremony/judgment pause fails safe. This is safe but means Goal 1 (brainstorm → plan → execute → review without approvals) is not met under autopilot. Fix is a code change (add harness MCP tools + a spawn tool to the persona tool lists, regenerate, re-check the arch ratchet) and should be a follow-up phase or issue before the feature is advertised as end-to-end; this plan only documents it.
2. **Roadmap sync exemption is outward-reaching.** `manage_roadmap sync` can auto-sync to the GitHub tracker (an outward write). Task 1 exempts it from the `irreversible` class as directed (avoid SC10 drift); ADR 0138/the guide should state that this is a deliberate exemption, not an oversight.
3. ADR numbers can collide if `origin/main` lands 0136+ before merge; Task 2 re-checks, but a later rebase must re-check again.
