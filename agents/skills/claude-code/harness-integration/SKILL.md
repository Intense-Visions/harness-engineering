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
