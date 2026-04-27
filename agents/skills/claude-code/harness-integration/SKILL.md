# Harness Integration

> Verify system wiring, materialize knowledge artifacts, and update project metadata. Integration is a gate, not a discovery phase -- it confirms that planned integration tasks completed.

## When to Use

- After execution completes and verification passes (between VERIFY and REVIEW in the workflow)
- When the autopilot state machine reaches the INTEGRATE state
- When validating that a feature is properly wired into the system (barrel exports, skill discovery, route mounts)
- When materializing architectural decisions as durable ADRs
- When `on_commit` or `on_pr` triggers fire and integration verification is needed
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

2. **Derive execution-time tier.** Analyze the git diff from the execution phase:

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
