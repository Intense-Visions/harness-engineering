# Harness Integration

> Verify system wiring, materialize knowledge artifacts, and update project metadata. Integration is a gate, not a discovery phase -- it confirms that planned integration tasks completed.

## When to Use

- After execution completes and verification passes (between VERIFY and REVIEW in the workflow)
- When the autopilot state machine reaches the INTEGRATE state
- When validating that a feature is properly wired into the system (barrel exports, skill discovery, route mounts)
- When materializing architectural decisions as durable ADRs
- When invoked standalone to check integration completeness of a feature branch
- NOT as a replacement for verification (verification checks code correctness; integration checks system connectivity)
- NOT for discovering integration work (integration work is planned upfront in brainstorming and planning)
- NOT for implementing fixes (integration identifies gaps; the executor fixes them)

## Process

### Iron Law

**No integration claim may be made without checking every planned integration task against the codebase.**

Integration checking is mechanical: did the planned task produce the expected artifact? "It should be there" is not evidence. Check the file, check the import, check the registration. Report what you observed.

The words "should", "probably", "seems to", and "I believe" are forbidden in integration reports. Replace with "verified: [evidence]" or "not verified: [what is missing]."

---

### Argument Resolution

When invoked by autopilot (or with explicit arguments), resolve paths before starting:

1. **Session slug:** If `session-slug` argument provided, set `{sessionDir} = .harness/sessions/<session-slug>/`. Pass to `gather_context({ session: "<session-slug>" })`. All report writes go to `{sessionDir}/`.
2. **Plan path:** Discover from `{sessionDir}/handoff.json` (read upstream execution/verification output). The plan contains integration tasks tagged `category: "integration"` and the `integrationTier` field.
3. **Rigor level:** If `fast`/`thorough` argument provided, use it. Otherwise default to `standard`.

When no arguments are provided (standalone invocation), discover plan from `docs/plans/` or prompt. Global `.harness/` paths used as fallback.

---

### Tier Resolution

Before running sub-phases, resolve the effective integration tier:

1. **Read plan-time tier.** Extract `integrationTier` from the plan header (small, medium, or large). If absent, default to `small`.

2. **Derive execution-time tier.** Read the execution start commit from the session handoff (`startCommit` field in `{sessionDir}/handoff.json`). If unavailable, use the autopilot's `startingCommit` from `{sessionDir}/autopilot-state.json`. Diff `startCommit..HEAD` to analyze the execution phase:

   ```
   newPackages > 0                    -> large
   newPublicExports > 5               -> large (minimum)
   filesChanged > 15 AND newExports   -> medium (minimum)
   else                               -> keep plan estimate
   ```

   To count these signals:
   - `newPackages`: count new `package.json` files in the diff
   - `newPublicExports`: count new `export` statements in barrel/index files
   - `filesChanged`: count total files changed in the diff
   - `newExports`: boolean, true if any new `export` statements exist

3. **Apply max(planned, derived).** The effective tier is the higher of the two.

4. **Notify on escalation.** If derived tier exceeds planned tier, notify the human:

   ```
   Tier escalated from `small` to `medium`: 8 new exports detected.
   ```

   Use `emit_interaction` with type `confirmation` to inform and get acknowledgment.

---

### Rigor Level Interaction

| Rigor      | INTEGRATE behavior                                                                     |
| ---------- | -------------------------------------------------------------------------------------- |
| `fast`     | WIRE only (default checks), auto-approve, no ADR drafting                              |
| `standard` | Full tier-appropriate checks (WIRE for all; MATERIALIZE + UPDATE for medium and large) |
| `thorough` | Full checks + human reviews every ADR draft + force knowledge graph verification       |

---

### Context Loading

Before running sub-phases, load session context:

```json
gather_context({
  path: "<project-root>",
  intent: "Verify integration of executed plan",
  skill: "harness-integration",
  session: "<session-slug-if-provided>",
  include: ["state", "learnings", "handoff", "graph", "businessKnowledge", "sessions", "validation"]
})
```

Load the plan, identify integration tasks (tagged `category: "integration"`), and group them by sub-phase:

- **WIRE tasks:** Entry point registration, barrel exports, skill discovery, route mounts
- **MATERIALIZE tasks:** ADR writing, knowledge graph enrichment, documentation updates
- **UPDATE tasks:** Roadmap sync, changelog, spec cross-references

---

### Sub-Phase 1: WIRE (all tiers)

Report progress: `**[WIRE]** Checking system wiring`

WIRE always runs, regardless of tier. It has two parts: default checks (always) and task-specific checks (when integration tasks exist).

#### Default Checks (always run)

These run even with zero explicit integration tasks (D8: barrel exports and validation are cheap and catch real problems).

1. **Barrel export check.** Run `pnpm run generate-barrel-exports --check`. If the `--check` flag is not supported, fall back to:
   - Run `pnpm run generate-barrel-exports`
   - Run `git diff --name-only`
   - If barrel files changed, the previous execution missed this step. Record as FAIL with the list of changed barrel files.
   - If no changes, barrel exports are current. Record as PASS.

2. **Harness validate.** Run `pnpm harness validate`. Must pass. Record result.

#### Task-Specific Checks (when integration tasks exist)

For each integration task tagged `category: "integration"` that relates to wiring:

3. **Entry point reachability.** Trace from known entry points to new code:
   - CLI: search for the new command/function in the `createProgram()` registration chain
   - MCP: search for the new tool in `getToolDefinitions()` or tool registration files
   - Skill: verify `skill.yaml` + `SKILL.md` exist at the expected path and skill appears in `harness skill list` output or discovery glob results
   - If the task claims a new entry point, verify it is reachable from at least one system entry point. An unreachable entry point is dead code.

4. **Skill discovery verification.** If a new skill was created:
   - Verify `agents/skills/claude-code/<skill-name>/skill.yaml` exists and has valid YAML
   - Verify `agents/skills/claude-code/<skill-name>/SKILL.md` exists and is non-empty
   - Verify the skill appears in `harness skill list` output (or would appear based on glob pattern)

5. **Route mount verification.** If a new API route was added:
   - Verify the route handler file exists
   - Verify the route is imported and mounted in the router/app configuration
   - Verify a request to the route path would be handled (trace the mount chain)

6. **Produce wiring report.** Write `{sessionDir}/integration-wiring.json`:

   ```json
   {
     "subPhase": "wire",
     "tier": "<effective-tier>",
     "timestamp": "<ISO-8601>",
     "defaultChecks": {
       "barrelExports": { "status": "pass|fail", "detail": "<description>" },
       "harnessValidate": { "status": "pass|fail", "detail": "<output summary>" }
     },
     "taskChecks": [
       {
         "taskRef": "Task N: <name>",
         "check": "<what was verified>",
         "status": "pass|fail",
         "evidence": "<file:line or command output>"
       }
     ],
     "verdict": "pass|fail"
   }
   ```

---

### Sub-Phase 2: MATERIALIZE (medium + large tiers)

Report progress: `**[MATERIALIZE]** Checking knowledge materialization`

Skip this sub-phase for `small` tier or `fast` rigor. For medium and large tiers:

#### Decision Harvesting

1. **Read handoff decisions.** Load `{sessionDir}/handoff.json` from all phases in this session. Collect all entries from the `decisions` array.

2. **Classify decisions.** For each decision:
   - **Architectural** (large tier): Decisions that affect system structure, introduce new patterns, or change integration boundaries. These warrant ADRs.
   - **Minor** (medium + large tier): Decisions about implementation approach, naming, or local design. These enrich the knowledge graph directly without an ADR.

#### ADR Auto-Drafting (large tier only)

3. **Auto-draft ADRs** from architectural decisions. For each architectural decision:

   a. **Assign ADR number.** Scan `docs/knowledge/decisions/` for existing ADR files matching `NNNN-*.md`. Take the highest number and increment by 1. If the directory does not exist, create it and start at `0001`.

   b. **Generate slug.** Convert the decision title to a URL-safe slug (lowercase, hyphens, no special characters).

   c. **Write ADR** to `docs/knowledge/decisions/NNNN-<slug>.md`:

   ```markdown
   ---
   number: NNNN
   title: <decision title>
   date: <ISO date>
   status: accepted
   tier: large
   source: <spec path or session slug>
   supersedes: <prior ADR number, if any>
   ---

   ## Context

   <What situation prompted this decision? What constraints existed?>

   ## Decision

   <What was decided and why?>

   ## Consequences

   <What follows from this decision -- positive, negative, and neutral?>
   ```

   d. **Present for review.** In `thorough` rigor, present each ADR draft via `emit_interaction` (type: `confirmation`) and wait for human approval. In `standard` rigor, auto-approve but log the draft for review.

#### Knowledge Graph Enrichment (medium + large tiers)

4. **Enrich knowledge graph.** For each decision (both architectural and minor):
   - Call `ingest_source` with the decision metadata so decisions become queryable graph nodes
   - For ADR-sourced decisions, the ADR file path is the source
   - For minor decisions, the handoff.json decision text is the content

#### Documentation Task Verification

5. **Verify documentation integration tasks.** For each integration task tagged `category: "integration"` that relates to documentation:
   - Verify the specified document was updated (file exists, content includes expected additions)
   - Verify AGENTS.md was updated if the task required it
   - Verify guides were written if the task required it

6. **Produce materialization report.** Write `{sessionDir}/integration-materialization.json`:

   ```json
   {
     "subPhase": "materialize",
     "tier": "<effective-tier>",
     "timestamp": "<ISO-8601>",
     "decisions": {
       "total": 0,
       "architectural": 0,
       "minor": 0
     },
     "adrs": [
       {
         "number": "NNNN",
         "title": "<title>",
         "path": "docs/knowledge/decisions/NNNN-<slug>.md",
         "status": "drafted|approved"
       }
     ],
     "graphEnrichment": {
       "nodesCreated": 0,
       "status": "pass|fail|skipped"
     },
     "documentationChecks": [
       {
         "taskRef": "Task N: <name>",
         "status": "pass|fail",
         "evidence": "<description>"
       }
     ],
     "verdict": "pass|fail|skipped"
   }
   ```

---

### Sub-Phase 3: UPDATE (medium + large tiers)

Report progress: `**[UPDATE]** Checking project metadata updates`

Skip this sub-phase for `small` tier or `fast` rigor. For medium and large tiers:

1. **Roadmap sync.** If `docs/roadmap.md` exists, call `manage_roadmap` with `sync` and `apply: true` to update feature status. If `manage_roadmap` is unavailable, fall back to noting the roadmap needs manual sync.

2. **Changelog verification.** If `CHANGELOG.md` exists at the project root:
   - Read the file and check for a new entry matching the current feature
   - If no entry exists, record as FAIL with instruction: "Add a changelog entry for this feature under the Unreleased section."
   - If no `CHANGELOG.md` exists, skip silently (not all projects use changelogs)

3. **Spec cross-reference annotation.** Read the spec at its path (from the plan or handoff):
   - For each phase in the spec's Implementation Order, check if implementation files can be linked
   - If the spec does not have file annotations, note this as an improvement suggestion (not a failure)

4. **Produce update report.** Write `{sessionDir}/integration-updates.json`:

   ```json
   {
     "subPhase": "update",
     "tier": "<effective-tier>",
     "timestamp": "<ISO-8601>",
     "roadmap": { "status": "synced|skipped|failed", "detail": "<description>" },
     "changelog": { "status": "pass|fail|skipped", "detail": "<description>" },
     "specCrossRef": { "status": "annotated|skipped", "detail": "<description>" },
     "verdict": "pass|fail|skipped"
   }
   ```

---

### Combined Report and Verdict

After all applicable sub-phases complete, produce the combined integration report:

1. **Write combined report.** Write `{sessionDir}/phase-{N}-integration.json`:

   ```json
   {
     "phase": "integration",
     "tier": "<effective-tier>",
     "rigor": "<fast|standard|thorough>",
     "timestamp": "<ISO-8601>",
     "subPhases": {
       "wire": { "verdict": "pass|fail", "reportPath": "{sessionDir}/integration-wiring.json" },
       "materialize": {
         "verdict": "pass|fail|skipped",
         "reportPath": "{sessionDir}/integration-materialization.json"
       },
       "update": {
         "verdict": "pass|fail|skipped",
         "reportPath": "{sessionDir}/integration-updates.json"
       }
     },
     "verdict": "pass|fail",
     "failures": [
       {
         "subPhase": "<wire|materialize|update>",
         "taskRef": "Task N: <name>",
         "issue": "<what is incomplete>",
         "fix": "<specific fix instruction>"
       }
     ]
   }
   ```

2. **Report verdict.** Summarize pass/fail per sub-phase. On failure, list exactly which integration tasks are incomplete with specific fix instructions.

3. **On PASS:** Write handoff and emit transition to REVIEW:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "integration",
       suggestedNext: "review",
       reason: "Integration passed at all applicable sub-phases",
       artifacts: ["<report paths>"],
       requiresConfirmation: false,
       summary: "Integration passed: tier <tier>. WIRE passed. MATERIALIZE <passed|skipped>. UPDATE <passed|skipped>.",
       qualityGate: {
         checks: [
           { "name": "wire-checks", "passed": true },
           { "name": "materialize-checks", "passed": true },
           { "name": "update-checks", "passed": true },
           { "name": "harness-validate", "passed": true }
         ],
         allPassed: true
       }
     }
   })
   ```

   Immediately invoke harness-code-review without waiting for user input.

4. **On FAIL:** Do NOT emit a transition. Report incomplete items with fix instructions. Present options via `emit_interaction`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "Integration failed. <N> items incomplete. How to proceed?",
       options: [
         { "label": "fix -- Re-enter EXECUTE with integration-specific fix tasks, then re-VERIFY, re-INTEGRATE", "risk": "low", "effort": "medium" },
         { "label": "skip -- Record decision and proceed to REVIEW (human override)", "risk": "medium", "effort": "low" },
         { "label": "stop -- Save state and exit", "risk": "low", "effort": "low" }
       ],
       recommendation: { "optionIndex": 0, "reason": "Fixing integration gaps now prevents review rework.", "confidence": "high" }
     }
   })
   ```

   - **fix:** Record fix tasks in handoff. The autopilot re-enters EXECUTE with those tasks.
   - **skip:** Record the skip decision in `decisions[]` in handoff. Proceed to REVIEW.
   - **stop:** Write handoff with current state and stop.

---

### Handoff

Write handoff to the session-scoped path when session slug is known, otherwise fall back to global:

- Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
- Global (fallback, **deprecated**): `.harness/handoff.json`

> **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json` to prevent cross-session contamination.

```json
{
  "fromSkill": "harness-integration",
  "phase": "COMPLETE",
  "summary": "<verdict summary>",
  "tier": "<effective-tier>",
  "artifacts": ["<report paths>", "<ADR paths if any>"],
  "verdict": "pass | fail",
  "gaps": ["<gap descriptions if any>"],
  "decisions": [{ "what": "<decision>", "why": "<rationale>" }]
}
```

**Session summary (if session known):** Update via `writeSessionSummary` with skill, status (`Integration <PASS|FAIL>. Tier: <tier>. <N> checks, <N> gaps.`), keyContext, and nextStep.

## Session State

| Section       | Read | Write | Purpose                                                                  |
| ------------- | ---- | ----- | ------------------------------------------------------------------------ |
| terminology   | yes  | no    | Consistent language in integration reports                               |
| decisions     | yes  | yes   | Reads all phase decisions for ADR drafting; writes integration decisions |
| constraints   | yes  | no    | Respect existing constraints during checks                               |
| risks         | yes  | yes   | Reads risks; writes integration risks discovered during checks           |
| openQuestions | yes  | yes   | Reads questions; resolves those answered by integration evidence         |
| evidence      | yes  | yes   | Prior evidence; writes wiring, materialization, and update evidence      |

**When to write:** After each sub-phase, append evidence entries. After ADR drafting, write decisions.

**When to read:** During Context Loading via `gather_context` with `include: ["state", "learnings", "handoff", "graph", "businessKnowledge", "sessions", "validation"]`.

## Evidence Requirements

Every pass/fail assertion in the integration report MUST include concrete evidence:

1. **File reference:** `file:line` with observed content (e.g., `src/index.ts:12` -- "exports NotificationService")
2. **Command output:** Actual command and output (e.g., `pnpm run generate-barrel-exports --check` -- "No changes detected")
3. **Harness output:** `harness validate` output
4. **Git diff evidence:** `git diff --name-only` output for barrel export checks
5. **Discovery evidence:** `harness skill list` output for skill discovery verification
6. **Session evidence:** Record evidence in the sub-phase report JSON files written to the session directory

**When to cite:** At every check. Each pass/fail in the wiring, materialization, and update reports must be backed by evidence.

**Uncited claims:** Any integration assertion without direct evidence is an integration failure. This skill does not use `[UNVERIFIED]` -- if evidence cannot be produced, verdict is FAIL.

## Harness Integration

- **`gather_context`** -- Load session-scoped state, learnings, handoff, and validation before sub-phases. `session` parameter scopes to session directory.
- **`harness validate`** -- Run during WIRE default checks. Must pass.
- **`harness check-deps`** -- Run during WIRE if new modules were added.
- **`ingest_source`** -- Run during MATERIALIZE to enrich knowledge graph with decision nodes.
- **`manage_roadmap`** -- Run during UPDATE to sync roadmap status. Use `sync` with `apply: true`.
- **`emit_interaction`** -- Tier escalation notification, ADR review (thorough mode), fail/skip/stop decision, transition to REVIEW on pass.
- **Session directory** -- `.harness/sessions/<slug>/` contains all report files. Do not write to global `.harness/` when session slug is known.

## Success Criteria

- WIRE default checks run for every tier (including small) -- barrel exports current, harness validate passes
- All planned integration tasks verified with evidence
- ADRs drafted for large-tier architectural decisions with correct format and sequential numbering
- Knowledge graph enriched with decision nodes (medium + large tiers)
- Documentation tasks verified as complete (medium + large tiers)
- Roadmap synced, changelog verified (medium + large tiers)
- Combined report written with pass/fail per sub-phase
- Tier derivation correctly escalates when execution exceeds plan estimates
- Fast rigor completes in seconds (WIRE only, no ADRs, no graph enrichment)
- Failure report includes specific fix instructions for each incomplete item

## Red Flags

| Flag                                                                          | Corrective Action                                                                                                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "Barrel exports probably have not changed, so I will skip the check"          | STOP. WIRE default checks always run. "Probably" is forbidden. Run the check and report the result.                                      |
| "The ADR looks correct from the decision text, no need to present for review" | STOP. In thorough mode, every ADR draft requires human review. In standard mode, auto-approve but log. Do not skip the review protocol.  |
| "Integration tasks are just bureaucracy, I will mark them as passed"          | STOP. Integration tasks exist because brainstorming and planning identified real connection points. Each must be verified with evidence. |
| "The knowledge graph enrichment failed but it is not critical"                | STOP. In thorough mode, graph enrichment failure is a FAIL. In standard mode, log the failure and include in the report.                 |
| "I will fix the missing barrel export myself to make WIRE pass"               | STOP. Integration identifies gaps -- integration never fills them. Record as FAIL with fix instructions. The executor fixes it.          |

## Rationalizations to Reject

| Rationalization                                                                        | Reality                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "WIRE passed so the feature is properly integrated"                                    | WIRE checks wiring only. For medium/large tiers, MATERIALIZE and UPDATE must also pass. Partial integration is not integration.                                        |
| "This is a small change, so I can skip tier derivation and just use the plan estimate" | Tier derivation is mandatory. Even if the plan says small, execution may have produced more changes than expected. Always derive and compare.                          |
| "The ADR format is close enough, no need to match the exact frontmatter schema"        | ADRs must match the spec format exactly (number, title, date, status, tier, source, supersedes). The knowledge pipeline depends on consistent frontmatter for parsing. |
| "Integration tasks were not in the plan, so there is nothing to check"                 | WIRE default checks always run regardless of planned integration tasks (D8). If the plan has no integration tasks, WIRE still checks barrel exports and runs validate. |
| "I found an integration gap but it is minor, so I will mark it as pass with a note"    | A gap is a FAIL, not a conditional pass. Record the gap, report it, and let the human decide whether to fix or skip.                                                   |

## Examples

### Example: Small Tier Integration (Bug Fix)

```
## Integration Report

**Tier:** small (plan: small, derived: small)
**Rigor:** standard

### WIRE
- [PASS] Barrel exports: `pnpm run generate-barrel-exports --check` -- no changes
- [PASS] Harness validate: passes
- No integration tasks to verify

### MATERIALIZE
- [SKIPPED] Small tier -- no materialization required

### UPDATE
- [SKIPPED] Small tier -- no updates required

### Verdict: PASS
```

### Example: Large Tier Integration (New Skill)

```
## Integration Report

**Tier:** large (plan: medium, derived: large -- escalated due to new package)
**Rigor:** standard

### WIRE
- [PASS] Barrel exports: regenerated, git diff shows no changes
- [PASS] Harness validate: passes
- [PASS] Skill discovery: harness-integration/skill.yaml exists, SKILL.md exists (420 lines)
- [PASS] Entry point: skill appears in harness skill list output
- [FAIL] Route mount: /api/integration not mounted in router

### MATERIALIZE
- [PASS] ADR 0001-tiered-integration-rigor.md drafted and auto-approved
- [PASS] Knowledge graph: 3 decision nodes created via ingest_source
- [PASS] AGENTS.md updated with integration phase description

### UPDATE
- [PASS] Roadmap synced: integration-phase moved to in-progress
- [FAIL] Changelog: no entry in CHANGELOG.md for integration phase
- [PASS] Spec cross-reference: annotated with implementation file links

### Verdict: FAIL -- 2 items incomplete
1. Route mount /api/integration not found in router configuration
   Fix: Add route import and mount in src/api/routes/index.ts
2. Changelog entry missing
   Fix: Add entry under Unreleased: "Added integration phase with tiered wiring verification"
```

## Gates

- **No skipping WIRE defaults.** Barrel export check and harness validate run for every tier, every rigor level. No exceptions.
- **No skipping tier derivation.** Always derive tier from execution results and compare with plan estimate. Higher tier wins.
- **No fixing during integration.** Integration identifies gaps. Integration never fills them. Record as FAIL and report.
- **No auto-passing MATERIALIZE in thorough mode.** Every ADR draft must be presented for human review in thorough mode.
- **No integration without a plan.** If no plan exists, there are no integration tasks to verify. Run WIRE defaults only and note the absence.
- **No forbidden hedging language.** "Should", "probably", "seems to" are forbidden. Use evidence or state "not verified."

## Escalation

- **Barrel export generation command not found:** Record as FAIL. Instruct: "The project does not have a `generate-barrel-exports` script. Add it to package.json or skip barrel export verification."
- **Knowledge graph tools unavailable:** If `ingest_source` is not available, record materialization as skipped with reason. Do not block on tooling absence for medium tier. For large tier in thorough mode, escalate.
- **ADR directory does not exist:** Create `docs/knowledge/decisions/` on first ADR write. This is expected for projects that have not used ADRs before.
- **Plan has no integration tier:** Default to small. Run WIRE defaults only.
- **Tier derivation signals ambiguous:** When git diff counts are borderline (e.g., exactly 5 new exports), use the plan estimate as tiebreaker.
- **Integration fails repeatedly after fix attempts:** After 2 fix cycles, escalate: "Integration has failed <N> times. The integration tasks may need redesign. Review the plan's integration section."
