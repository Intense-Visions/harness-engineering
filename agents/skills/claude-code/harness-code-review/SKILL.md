# Harness Code Review

> Multi-phase code review pipeline — mechanical checks, graph-scoped context, parallel review agents, cross-agent deduplication, and structured output with technical rigor over social performance.

## When to Use

- When performing a code review (manual invocation or triggered by `on_pr` / `on_review`)
- When requesting a review of completed work (see Role A at the end of this document)
- When responding to review feedback (see Role C at the end of this document)
- NOT for in-progress work (complete the feature first)
- NOT for rubber-stamping (if you cannot find issues, look harder or state confidence level)
- NOT for style-only feedback (leave that to linters and mechanical checks)

## Process

The review runs as a 7-phase pipeline. Each phase has a clear input, output, and exit condition.

```
Phase 1: GATE --> Phase 2: MECHANICAL --> Phase 3: CONTEXT --> Phase 4: FAN-OUT
                                                                      |
Phase 7: OUTPUT <-- Phase 6: DEDUP+MERGE <-- Phase 5: VALIDATE <------+
```

| Phase          | Tier  | Purpose                          | Exit Condition                                    |
| -------------- | ----- | -------------------------------- | ------------------------------------------------- |
| 1. GATE        | fast  | Skip ineligible PRs (CI only)    | PR eligible, or exit with reason                  |
| 2. MECHANICAL  | none  | Lint, typecheck, test, sec scan  | All pass -> continue; any fail -> report and stop |
| 3. CONTEXT     | fast  | Scope context per review domain  | Context bundles assembled for each subagent       |
| 4. FAN-OUT     | mixed | Parallel review subagents        | All subagents return ReviewFinding[]              |
| 5. VALIDATE    | none  | Exclude mechanical dupes, verify | Unvalidated findings discarded                    |
| 6. DEDUP+MERGE | none  | Group, merge, assign severity    | Deduplicated finding list with merged evidence    |
| 7. OUTPUT      | none  | Text output or GitHub comments   | Review delivered, exit code set                   |

### Finding Schema

```typescript
interface ReviewFinding {
  id: string; // unique, for dedup
  file: string; // file path
  lineRange: [number, number]; // start, end
  domain: 'compliance' | 'bug' | 'security' | 'architecture';
  severity: 'critical' | 'important' | 'suggestion';
  title: string; // one-line summary
  rationale: string; // why this is an issue
  suggestion?: string; // fix, if available
  evidence: string[]; // supporting context from agent
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
}
```

### Flags

| Flag              | Effect                                                               |
| ----------------- | -------------------------------------------------------------------- |
| `--comment`       | Post inline comments to GitHub PR via `gh` CLI or GitHub MCP         |
| `--deep`          | Pass `--deep` to `harness-security-review` for threat modeling       |
| `--no-mechanical` | Skip mechanical checks (useful if already run in CI)                 |
| `--ci`            | Enable eligibility gate, non-interactive output                      |
| `--fast`          | Skip learnings, fast-tier agents for all fan-out slots               |
| `--thorough`      | Always load learnings, full roster + meta-judge, learnings in output |

### Rigor Levels

Set via `--fast` or `--thorough` flags (or passed by autopilot). Default is `standard`.

| Phase      | `fast`                                        | `standard` (default)                                       | `thorough`                                                                                                                     |
| ---------- | --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 3. CONTEXT | Skip learnings entirely                       | Load learnings if file exists; score via filterByRelevance | Always load learnings; fail loudly if missing                                                                                  |
| 4. FAN-OUT | All agents at fast tier. Reduced focus areas. | Default tier assignments                                   | Full roster + meta-judge confirms findings cited by multiple agents, flags contradictions, and surfaces cross-cutting concerns |
| 7. OUTPUT  | Standard format                               | Standard format                                            | Include "Learnings Applied" section with relevance scores                                                                      |

### Model Tiers

Tiers are abstract labels resolved at runtime from project config. If no config exists, all phases use the current model.

| Tier       | Default      | Used By                              |
| ---------- | ------------ | ------------------------------------ |
| `fast`     | haiku-class  | GATE, CONTEXT                        |
| `standard` | sonnet-class | Compliance agent, Architecture agent |
| `strong`   | opus-class   | Bug Detection agent, Security agent  |

### Review Learnings Calibration

Before starting the pipeline, check for a project-specific calibration file. Behavior by rigor:

- **`fast`:** Skip entirely. Do not read or score learnings.
- **`standard`:** Read if file exists, score and filter. If missing, use default focus areas.
- **`thorough`:** Always read. If `.harness/review-learnings.md` missing, log warning.

If `.harness/review-learnings.md` exists (and rigor is not `fast`):

1. **Useful Findings section** — prioritize these categories (historically caught real issues).
2. **Noise / False Positives section** — de-prioritize or skip (wastes author time).
3. **Calibration Notes section** — apply as project-specific overrides.

#### Learnings Relevance Scoring

When learnings are loaded (standard or thorough), score against diff context before applying:

1. **Build diff context string.** Concatenate changed file paths + diff summary.
2. **Score each learning** via `filterByRelevance(learnings, diffContext, 0.7, 1000)` from `packages/core/src/state/learnings-relevance.ts`. Only learnings >= 0.7 retained, sorted by score, truncated to 1000-token budget.
3. **Apply filtered learnings:** boost priority for passing Useful Findings, suppress passing Noise entries, apply passing Calibration Notes as overrides.
4. **If none pass 0.7 threshold,** use default focus areas. No fallback to unscored inclusion.

After review, consider suggesting `.harness/review-learnings.md` creation if you notice patterns that would benefit from calibration.

## Pipeline Phases

### Phase 1: GATE

**Tier:** fast | **Mode:** CI only (`--ci`). Skip when invoked manually.

Checks whether the PR should be reviewed at all, preventing wasted compute in CI.

**Checks:**

1. **PR state:** Closed or merged? -> Skip: "PR is closed."
2. **Draft status:** Draft? -> Skip: "PR is draft."
3. **Trivial change:** All changed files `.md`? -> Skip: "Documentation-only change."
4. **Already reviewed:** Same commit range reviewed before? -> Skip: "Already reviewed at {sha}."

```bash
gh pr view --json state,isDraft,files
gh pr diff --name-only | grep -v '\.md$' | wc -l  # 0 means docs-only
```

**Exit:** If any check triggers skip, output reason and exit 0. Otherwise continue to Phase 2.

---

### Phase 2: MECHANICAL

**Tier:** none (no LLM) | **Mode:** Skipped with `--no-mechanical`.

Run mechanical checks to establish an exclusion boundary. Issues caught here are excluded from AI review (Phase 4).

**Checks:**

1. **Harness validation:** `assess_project({ path, checks: ["validate", "deps", "docs"], mode: "detailed" })` — runs checks in parallel.
2. **Security scan:** `run_security_scan` on changed files. Record findings with rule ID, file, line.
3. **Type checking:** Run `tsc --noEmit`. Record errors.
4. **Linting:** Run linter. Record violations.
5. **Tests:** Run test suite. Record failures.

**Output:** Set of mechanical findings (file, line, tool, message) forming the exclusion list for Phase 5.

#### Evidence Gate (session-aware)

When `sessionSlug` is available, load evidence entries from session state and cross-reference with findings:

1. Load: `readSessionSection(projectRoot, sessionSlug, 'evidence')`
2. Check if evidence entries reference the same file:line as each finding
3. Unmatched findings tagged `[UNVERIFIED]`
4. Append coverage report: evidence entries count, findings with evidence, coverage %

When no session is available, skip silently. Evidence checking enhances but does not gate reviews.

**Exit:** If harness validate, typecheck, or tests fail, report in Strengths/Issues/Assessment format and stop. Lint warnings and security findings do not stop the pipeline -- recorded for exclusion only.

---

### Phase 3: CONTEXT

**Tier:** fast | **Purpose:** Assemble scoped context bundles per review domain. Each subagent receives only domain-relevant context.

#### Change-Type Detection

Determine change type to shape review focus:

1. **Commit prefix:** `feat:` -> feature, `fix:` -> bugfix, `refactor:` -> refactor, `docs:` -> docs
2. **Diff heuristic:** New files + tests -> feature; small changes + test -> bugfix; renames/moves -> refactor; only `.md` -> docs
3. **Default:** If ambiguous, treat as feature (most thorough review).

#### Context Scoping

| Domain            | With Graph                                                | Without Graph (Fallback)                                  |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| **Compliance**    | Convention files + changed files                          | Same (no graph needed)                                    |
| **Bug Detection** | Changed files + dependencies via `query_graph`            | Changed files + imported files (`grep import`)            |
| **Security**      | Security paths + data flow via `query_graph`              | Changed files + files with auth/crypto/SQL/shell patterns |
| **Architecture**  | Layer boundaries + imports via `query_graph`/`get_impact` | Changed files + `harness check-deps` output               |

#### 1:1 Context Ratio Rule

- **Small diffs (<20 lines):** 3:1 context-to-diff ratio.
- **Medium diffs (20-200 lines):** 1:1 ratio. Full files + immediate dependencies.
- **Large diffs (>200 lines):** 1:1 floor. Prioritize ruthlessly. Flag as review concern.

#### Context Gathering Priority

1. Files directly imported/referenced by changed files
2. Corresponding test files (note if missing)
3. Spec/design docs mentioning changed components
4. Type definitions consumed or produced by changed code
5. Recent commits touching the same files

#### Graph-Enhanced Context

When `.harness/graph/` exists, use `gather_context` for efficient assembly:

```json
gather_context({
  path: "<project-root>",
  intent: "Code review of <change description>",
  skill: "harness-code-review",
  session: "<session-slug-if-provided>",
  tokenBudget: 8000,
  include: ["graph", "learnings", "validation"]
})
```

Replaces manual `query_graph` + `get_impact` + `find_context_for` calls. Falls back gracefully when no graph exists. Supplement with targeted `query_graph` calls for domain-specific scoping.

#### Context Assembly Commands

```bash
git diff --stat HEAD~1                    # measure diff size
git diff HEAD~1 -- <file>                 # per-file diff
grep -n "import\|require\|from " <file>   # find imports
find . -name "*<module>*test*" -o -name "*<module>*spec*"
grep -rl "<component>" docs/changes/ docs/design-docs/ docs/plans/
grep -rn "interface\|type\|schema" <changed-file> | head -20
```

#### Commit History Context

```bash
git log --oneline -5 -- <affected-file>
```

Use to determine: **Hotspot?** (3+ changes in last 5 commits) **Recently refactored?** **Multiple authors?** **Last change was bugfix?** (yellow flag)

**Exit:** Context bundles assembled for all four domains. Continue to Phase 4.

---

### Phase 4: FAN-OUT

**Tier:** mixed | **Purpose:** Run four parallel review subagents with domain-scoped context. Each produces `ReviewFinding[]`.

**Rigor overrides:**

- **`fast`:** All agents at fast tier (haiku-class), reduced reasoning depth.
- **`standard`:** Default tiers per agent.
- **`thorough`:** Default tiers + meta-judge pass (strong tier) cross-validating findings, flagging contradictions, surfacing cross-cutting concerns.

#### Compliance Agent (standard tier)

Reviews adherence to project conventions, standards, and documentation.

**Input:** Compliance context bundle (convention files + changed files + change type)

**Focus by change type:**

_Feature:_

- [ ] **Spec alignment:** Implementation matches spec? All specified behaviors present?
- [ ] **API surface:** New interfaces minimal and well-named? Could exports be kept internal?
- [ ] **Backward compatibility:** Breaks existing callers? Migration path documented?

_Bugfix:_

- [ ] **Root cause identified:** Addresses root cause, not symptom?
- [ ] **Original issue referenced:** Commit/PR references bug report?
- [ ] **No collateral changes:** Only necessary changes?

_Refactor:_

- [ ] **Behavioral equivalence:** Existing tests pass without modification?
- [ ] **No functionality changes:** No new behavior introduced?

_Docs:_

- [ ] **Accuracy:** Documented behaviors match code?
- [ ] **Completeness:** All public interfaces documented?
- [ ] **Consistency:** Follows existing style and terminology?
- [ ] **Links valid:** All internal links resolve?

**Output:** `ReviewFinding[]` with `domain: 'compliance'`

---

#### Bug Detection Agent (strong tier)

Reviews for logic errors, edge cases, and correctness issues.

**Input:** Bug detection context bundle (changed files + dependencies)

**Focus areas:**

- [ ] **Edge cases:** Boundary conditions (empty, max, null, concurrent)
- [ ] **Error handling:** Appropriate level, helpful messages, no silent swallowing
- [ ] **Logic errors:** Off-by-one, incorrect boolean logic, missing early returns
- [ ] **Race conditions:** Concurrent shared state access, missing locks/atomics
- [ ] **Resource leaks:** Unclosed handles, missing cleanup in error paths
- [ ] **Type safety:** Mismatches, unsafe casts, missing null checks
- [ ] **Test coverage:** Happy path, error paths, edge cases. Meaningful, not just present.
- [ ] **Regression tests:** For bugfixes -- test that would have caught the bug

**Output:** `ReviewFinding[]` with `domain: 'bug'`

---

#### Security Agent (strong tier) -- via harness-security-review

Invokes `harness-security-review` in changed-files mode as the security fan-out slot.

**Input:** Security context bundle (security-relevant paths + data flows)

**Invocation:** Pipeline invokes `harness-security-review` with scope `changed-files`:

- Skips Phase 1 (SCAN) -- reads mechanical findings from PipelineContext
- Runs Phase 2 (REVIEW) -- OWASP baseline + stack-adaptive on changed files
- Skips Phase 3 (THREAT-MODEL) unless `--deep` was passed
- Returns `ReviewFinding[]` with security fields (`cweId`, `owaspCategory`, `confidence`, `remediation`, `references`)

**Focus areas:**

1. **Semantic security review** (beyond mechanical scanners):
   - Input flowing through multiple functions to dangerous sinks (SQL, shell, HTML)
   - Missing authorization on new/modified endpoints
   - Sensitive data in logs, errors, or API responses
   - Authentication bypass paths
   - Insecure defaults in new config

2. **Stack-adaptive:** Node.js (prototype pollution, ReDoS, path traversal), React (XSS, dangerouslySetInnerHTML), Go (race conditions, integer overflow, unsafe pointer), Python (pickle, SSTI, command injection)

3. **CWE/OWASP references:** All findings include `cweId`, `owaspCategory`, `remediation`.

Confirmed vulnerabilities are always `severity: 'critical'`.

**Dedup with mechanical scan:** Phase 5 uses the exclusion set from Phase 2 to discard overlapping findings.

**Output:** `ReviewFinding[]` with `domain: 'security'`

---

#### Architecture Agent (standard tier)

Reviews architectural violations, dependency direction, and design pattern compliance.

**Input:** Architecture context bundle (layer boundaries + import graph)

**Focus areas:**

- [ ] **Layer compliance:** Imports flowing in correct direction?
- [ ] **Dependency direction:** Depends on abstractions, not concretions?
- [ ] **Single Responsibility:** Each module has one reason to change?
- [ ] **Open/Closed:** Behavior extensible without modifying existing code?
- [ ] **Pattern consistency:** Follows established patterns? New patterns justified?
- [ ] **Separation of concerns:** Business logic separated from infrastructure?
- [ ] **DRY violations:** Duplicated logic to extract -- but NOT intentional duplication that will diverge.
- [ ] **Performance preserved:** Could restructuring introduce regressions?

**Output:** `ReviewFinding[]` with `domain: 'architecture'`

**Exit:** All four agents returned findings. Continue to Phase 5.

---

### Phase 5: VALIDATE

**Tier:** none (mechanical) | **Purpose:** Remove false positives via cross-referencing.

**Steps:**

1. **Mechanical exclusion:** Discard AI findings where same file + line range already flagged by Phase 2.
2. **Graph reachability (if available):** Verify claimed dependency paths via `query_graph`. Discard findings with invalid reachability claims.
3. **Import-chain heuristic (fallback):** Follow imports 2 levels deep. If claimed impact unreachable within 2 hops, downgrade to `suggestion`.

**Exit:** Validated finding set. Continue to Phase 6.

---

### Phase 6: DEDUP + MERGE

**Tier:** none (mechanical) | **Purpose:** Eliminate redundant findings across agents.

**Steps:**

1. **Group by location:** Group by `file` + overlapping `lineRange` (intersecting or within 3 lines).
2. **Merge overlapping findings:** Keep highest severity, combine evidence arrays, preserve strongest rationale, merge domain tags, generate merged ID.
3. **Assign final severity:**
   - **Critical** — Must fix. Bugs, security vulns, failing harness checks, boundary violations.
   - **Important** — Should fix. Missing error handling, missing critical-path tests, unclear naming.
   - **Suggestion** — Consider. Style, minor optimizations, alternatives. Does not block merge.

**Exit:** Deduplicated, severity-assigned list. Continue to Phase 7.

---

### Phase 7: OUTPUT

**Tier:** none | **Purpose:** Deliver review in requested format.

#### Text Output (default)

```
**[STRENGTH]** Clean separation between route handler and service logic
**[CRITICAL]** api/routes/users.ts:12-15 -- Direct import from db/queries.ts bypasses service layer
**[IMPORTANT]** services/user-service.ts:45 -- createUser does not handle duplicate email
**[SUGGESTION]** Consider extracting validation into a shared utility
```

**Strengths:** What is done well. Be specific -- "Clean separation between X and Y" not "Looks good".

**Issues:** Grouped by severity (Critical / Important / Suggestion). Each includes: location, problem, rationale, suggested fix.

**Assessment:** Approve (no critical/important), Request Changes (critical/important present), or Comment (observations only).

**Learnings Applied (thorough only):** List learnings with Jaccard scores and how they influenced review. Omitted in fast/standard.

**Exit code:** 0 for Approve/Comment, 1 for Request Changes.

#### Inline GitHub Comments (`--comment`)

- **Small fixes** (<10 lines): Committable suggestion block.
- **Large fixes** (>=10 lines or no concrete suggestion): Description + rationale comment.
- **Summary:** Top-level PR review comment with Strengths/Issues/Assessment.

```bash
gh pr review --event APPROVE|REQUEST_CHANGES|COMMENT --body "<summary>"
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --field body="<rationale>\n\`\`\`suggestion\n<fix>\n\`\`\`" \
  --field path="<file>" --field line=<line>
```

### Review Acceptance

```json
emit_interaction({
  path: "<project-root>",
  type: "confirmation",
  confirmation: {
    text: "Review complete: <Assessment>. Accept review?",
    context: "<N critical, N important, N suggestion findings>",
    impact: "Accepting finalizes findings. Approve = ready for merge. Request-changes = fixes needed.",
    risk: "<low if approve, high if critical>"
  }
})
```

#### Handoff and Transition

Write `.harness/handoff.json`:

```json
{
  "fromSkill": "harness-code-review",
  "phase": "OUTPUT",
  "summary": "<assessment summary>",
  "assessment": "approve | request-changes | comment",
  "findingCount": { "critical": 0, "important": 0, "suggestion": 0 },
  "artifacts": ["<reviewed files>"]
}
```

**Write session summary (if session known):**

```json
writeSessionSummary(projectPath, sessionSlug, {
  session: "<session-slug>",
  lastActive: "<ISO timestamp>",
  skill: "harness-code-review",
  spec: "<spec path if known>",
  status: "Review complete. Assessment: <type>. <N> findings.",
  keyContext: "<1-2 sentences: review outcome, key findings>",
  nextStep: "<Address findings / Ready to merge / Observations delivered>"
})
```

**If "approve":** Emit transition:

```json
{
  "type": "transition",
  "transition": {
    "completedPhase": "review",
    "suggestedNext": "merge",
    "reason": "Review approved with no blocking issues",
    "artifacts": ["<reviewed files>"],
    "requiresConfirmation": true,
    "summary": "Review approved. <N> suggestions. Ready for PR/merge.",
    "qualityGate": {
      "checks": [
        { "name": "mechanical-checks", "passed": true },
        { "name": "no-critical-findings", "passed": true },
        { "name": "no-important-findings", "passed": true },
        { "name": "harness-validate", "passed": true }
      ],
      "allPassed": true
    }
  }
}
```

If user confirms: proceed to create PR or merge. If user declines: stop.

**If "request-changes":** Do NOT emit transition. Surface critical/important findings for resolution. Re-run after fixes.

**If "comment":** Do NOT emit transition. Observations delivered, no further action implied.

---

## Role A: Requesting a Review

_Not part of the pipeline. Documents the process for requesting reviews._

1. **Prepare context:** Commit range, description (WHAT and WHY), plan reference, test evidence, harness check results.
2. **Dispatch:** Identify reviewer, provide context, state what feedback you want.
3. **Wait.** Do not modify code under review.

---

## Role C: Responding to Review Feedback

_Not part of the pipeline. Documents the process for responding to feedback._

1. **Read all feedback first.** Understand full picture before responding.
2. **Verify before implementing:** Understand it? Is it correct? Is it actionable?
3. **Technical rigor over social performance:**
   - Do NOT agree just to be agreeable. Push back with evidence if wrong.
   - Do NOT implement every suggestion. Apply YAGNI.
   - Do NOT make changes you do not understand. Ask.
   - DO acknowledge correct feedback.
   - DO push back when feedback contradicts approved plan/spec.
4. **Implement fixes:** Change, test, run `harness validate` and `harness check-deps`, commit referencing feedback.
5. **Re-request review** with change summary, addressed vs. pushed-back items, fresh harness results.

---

## Evidence Requirements

Every `ReviewFinding.evidence` array MUST include citations using one of:

1. **File reference:** `file:line` format (e.g., `src/api/routes/users.ts:12-15` -- "bypasses service layer")
2. **Diff evidence:** Before/after code with file path and line numbers
3. **Dependency chain:** Import path showing violation (e.g., `routes/users.ts:3 imports db/queries.ts`)
4. **Test evidence:** Test command and output for test-related findings
5. **Convention reference:** Specific convention file and rule (e.g., `AGENTS.md:45`)
6. **Session evidence:** Write to `evidence` session section via `manage_state`

**When to cite:** Phase 4 (each subagent populates evidence), Phase 5 (evidence verifies reachability), Phase 7 (every issue backed by evidence).

**Uncited claims:** Findings without evidence discarded in Phase 5. Observations without file:line references prefixed `[UNVERIFIED]` and downgraded to `suggestion`.

## Harness Integration

- **`assess_project`** — Phase 2: run validate/deps/docs in parallel. Failures are Critical and stop pipeline.
- **`gather_context`** — Phase 3: parallel context assembly. Session parameter scopes to session directory.
- **`harness cleanup`** — Optional Phase 2 check for entropy in changed files.
- **Graph queries** — Phase 3 (dependency context) and Phase 5 (reachability verification). Graceful fallback.
- **`emit_interaction`** — Post-review: suggest merge transition on APPROVE. Confirmed transition.
- **Rigor levels** — `--fast`/`--thorough` control learnings, agent tiers, output. See Rigor Levels table.
- **`filterByRelevance`** — Phase 3 learnings scoring. Threshold 0.7, budget 1000 tokens.

## Success Criteria

- Pipeline runs all 7 phases in order (skipping GATE without `--ci`)
- Mechanical failures in Phase 2 stop pipeline before AI review
- Each Phase 4 subagent receives only domain-scoped context
- All findings use ReviewFinding schema
- Mechanical findings excluded from Phase 4 output in Phase 5
- Cross-agent duplicates merged in Phase 6
- Text output uses Strengths/Issues/Assessment with Critical/Important/Suggestion
- `--comment` posts inline GitHub comments with committable suggestions
- `--deep` adds threat modeling to Security agent
- No code merges with Critical issues or failing harness checks
- Role C feedback verified before implementation; pushback is evidence-based
- `fast`: learnings skipped, all agents at fast tier
- `thorough`: learnings always loaded/scored, meta-judge validates, "Learnings Applied" in output
- `standard`: learnings included if file exists, scored at 0.7 threshold
- Zero learnings below threshold means zero included (no unscored fallback)

## Examples

### Example: Pipeline Review of a New API Endpoint

**Phase 1 (GATE):** Skipped -- manual invocation.

**Phase 2 (MECHANICAL):** `harness validate` passes. `harness check-deps` passes. Security scan clean. `tsc --noEmit` passes. Lint passes.

**Phase 3 (CONTEXT):** Change type: `feature` (prefix `feat:`). Bundles:

- Compliance: `CLAUDE.md` + changed files
- Bug detection: `api/routes/users.ts`, `services/user-service.ts`, `db/queries.ts`
- Security: `api/routes/users.ts` (endpoint), `services/user-service.ts` (data flow)
- Architecture: import graph showing `routes -> services -> db` layers

**Phase 4 (FAN-OUT):** Four agents in parallel:

- Compliance: 0 findings (spec alignment confirmed)
- Bug detection: 1 finding (missing duplicate email handling in createUser)
- Security: 0 findings
- Architecture: 1 finding (routes/users.ts imports directly from db/queries.ts)

**Phase 5 (VALIDATE):** No mechanical exclusions. Architecture finding validated by `check-deps` showing layer violation.

**Phase 6 (DEDUP+MERGE):** No overlaps -- 2 distinct findings in different files.

**Phase 7 (OUTPUT):**

**Strengths:**

- Clean separation between route handler and service logic
- Input validation using Zod schemas with clear error messages
- Comprehensive test coverage including error paths

**Issues:**

**Critical:**

- `api/routes/users.ts:12-15` -- Direct import from `db/queries.ts` bypasses service layer. Must route through `services/user-service.ts`. (domain: architecture, validatedBy: heuristic)

**Important:**

- `services/user-service.ts:45` -- `createUser` does not handle duplicate email. Database throws constraint violation surfacing as 500. Should catch and return 409. (domain: bug, validatedBy: heuristic)

**Suggestion:** (none)

**Assessment:** Request Changes -- one critical layer violation and one important missing error handler.

## Gates

- **Never skip mechanical checks without `--no-mechanical`.** If not run in CI or locally, they must run in Phase 2 before AI review.
- **Never merge with failing harness checks.** `harness validate` and `harness check-deps` must pass. Always Critical.
- **Never implement feedback without verification.** Verify correctness before changing code. Do not blindly comply.
- **Never agree performatively.** "Sure, I'll change that" without understanding is forbidden.
- **Never skip the YAGNI check.** Every suggestion must serve a current, concrete need. Speculative improvements rejected.

## Red Flags

### Universal

- **"I believe the codebase does X"** -- Stop. Read code, cite file:line. Belief is not evidence.
- **"Let me recommend [pattern]"** without checking existing patterns -- Stop. Search codebase first.
- **"While we're here, we should also..."** -- Stop. Flag the idea but do not expand scope.

### Domain-Specific

- **"The change looks reasonable, approving"** -- Stop. Read every changed file. Approval without full review is rubber-stamping.
- **"Let me fix this issue I found"** -- Stop. Review identifies; it does not fix. Suggest the fix.
- **"This is a minor style issue"** -- Stop. Style or readability/maintainability? Classify accurately.
- **"The author probably meant to..."** -- Stop. Do not infer intent. Flag ambiguity as a question.

## Rationalizations to Reject

| Rationalization                                     | Reality                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "The tests pass, so the logic must be correct"      | Tests can be incomplete. Review the logic independently of test results.                    |
| "This is how it was done elsewhere in the codebase" | Existing patterns can be wrong. Evaluate the pattern on its merits, not just its precedent. |
| "It's just a refactor, low risk"                    | Refactors change behavior surfaces. Review them with the same rigor as feature changes.     |

## Escalation

- **When reviewers disagree:** Escalate to the human or tech lead.
- **When review feedback changes the plan:** Pause review. Plan must be updated first.
- **When you cannot reproduce a reported issue:** Ask reviewer for exact reproduction steps.
- **When review takes more than 2 rounds:** Something is fundamentally misaligned. Stop and discuss synchronously.
- **When harness checks fail and you believe the check is wrong:** Do not override or skip. File an issue against harness config.
- **When pipeline produces a false positive after validation:** Add pattern to `.harness/review-learnings.md` Noise / False Positives section.
