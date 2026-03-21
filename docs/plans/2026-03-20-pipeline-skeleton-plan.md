# Plan: Pipeline Skeleton (Unified Code Review Pipeline — Phase 1)

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md
**Delta:** docs/changes/unified-code-review-pipeline/delta.md
**Estimated tasks:** 7
**Estimated time:** 25-35 minutes

## Goal

Restructure `harness-code-review` SKILL.md with the 7-phase pipeline structure, define phase boundaries, flag handling, and the ReviewFinding schema — mapping all existing review logic into the new phases without adding new behavior.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-code-review/SKILL.md` contains seven clearly labeled pipeline phases: GATE, MECHANICAL, CONTEXT, FAN-OUT, VALIDATE, DEDUP+MERGE, OUTPUT.
2. The SKILL.md contains a `ReviewFinding` TypeScript interface definition matching the spec's schema (id, file, lineRange, domain, severity, title, rationale, suggestion, evidence, validatedBy).
3. The SKILL.md documents four flags (`--comment`, `--deep`, `--no-mechanical`, `--ci`) with their effects on pipeline behavior.
4. The SKILL.md documents model tier abstraction (`fast`/`standard`/`strong`) with per-phase tier assignments.
5. All existing review logic (context assembly, change-type detection, security review, per-type checklists, code quality evaluation, architecture evaluation, testing evaluation, output format) is present in the restructured SKILL.md, mapped to appropriate phases.
6. The `agents/skills/claude-code/harness-code-review/skill.yaml` declares the four flags in the `args` section and has version `2.0.0`.
7. `agents/skills/gemini-cli/harness-code-review/SKILL.md` is byte-identical to the claude-code copy.
8. `agents/skills/gemini-cli/harness-code-review/skill.yaml` is byte-identical to the claude-code copy.
9. `pnpm harness validate` passes after all changes.
10. When reading the SKILL.md, a reviewer can trace each existing capability to a specific pipeline phase without ambiguity.

## File Map

- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (restructure into pipeline phases)
- MODIFY `agents/skills/claude-code/harness-code-review/skill.yaml` (add flags, bump version)
- MODIFY `agents/skills/gemini-cli/harness-code-review/SKILL.md` (copy from claude-code)
- MODIFY `agents/skills/gemini-cli/harness-code-review/skill.yaml` (copy from claude-code)

## Tasks

### Task 1: Update skill.yaml with flags and version bump

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/skill.yaml`

1. Read `agents/skills/claude-code/harness-code-review/skill.yaml`
2. Modify to produce this content:

```yaml
name: harness-code-review
version: '2.0.0'
description: Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel review agents
cognitive_mode: adversarial-reviewer
triggers:
  - manual
  - on_pr
  - on_review
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
cli:
  command: harness skill run harness-code-review
  args:
    - name: path
      description: Project root path
      required: false
    - name: --comment
      description: Post inline comments to GitHub PR
      required: false
    - name: --deep
      description: Add threat modeling pass (invokes security-review --deep)
      required: false
    - name: --no-mechanical
      description: Skip mechanical checks (useful if already run)
      required: false
    - name: --ci
      description: Enable eligibility gate, non-interactive output
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-code-review
    path: string
type: rigid
state:
  persistent: false
  files: []
depends_on: []
```

3. Verify valid YAML: `python3 -c "import yaml; yaml.safe_load(open('agents/skills/claude-code/harness-code-review/skill.yaml'))"`
4. Run: `pnpm harness validate`
5. Do NOT commit yet (will commit with SKILL.md in Task 7)

---

### Task 2: Write SKILL.md — Header, Pipeline Overview, and Flags

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

Replace the entire SKILL.md content. Start with the header, pipeline overview, finding schema, flags, and model tiers.

1. Write the top section of `agents/skills/claude-code/harness-code-review/SKILL.md`:

````markdown
# Harness Code Review

> Multi-phase code review pipeline — mechanical checks, graph-scoped context, parallel review agents, cross-agent deduplication, and structured output with technical rigor over social performance.

## When to Use

- When performing a code review (manual invocation or triggered by `on_pr` / `on_review`)
- When requesting a review of completed work (see Role A at the end of this document)
- When responding to review feedback (see Role C at the end of this document)
- NOT for in-progress work (complete the feature first)
- NOT for rubber-stamping (if you cannot find issues, look harder or state confidence level)
- NOT for style-only feedback (leave that to linters and mechanical checks)

## Pipeline Overview

The review runs as a 7-phase pipeline. Each phase has a clear input, output, and exit condition.

```
Phase 1: GATE ──→ Phase 2: MECHANICAL ──→ Phase 3: CONTEXT ──→ Phase 4: FAN-OUT
                                                                       │
Phase 7: OUTPUT ←── Phase 6: DEDUP+MERGE ←── Phase 5: VALIDATE ←──────┘
```

| Phase          | Tier  | Purpose                                            | Exit Condition                                        |
| -------------- | ----- | -------------------------------------------------- | ----------------------------------------------------- |
| 1. GATE        | fast  | Skip ineligible PRs (CI mode only)                 | PR is eligible, or exit with reason                   |
| 2. MECHANICAL  | none  | Lint, typecheck, test, security scan               | All pass → continue; any fail → report and stop       |
| 3. CONTEXT     | fast  | Scope context per review domain                    | Context bundles assembled for each subagent           |
| 4. FAN-OUT     | mixed | Parallel review subagents                          | All subagents return findings in ReviewFinding schema |
| 5. VALIDATE    | none  | Exclude mechanical duplicates, verify reachability | Unvalidated findings discarded                        |
| 6. DEDUP+MERGE | none  | Group, merge, assign final severity                | Deduplicated finding list with merged evidence        |
| 7. OUTPUT      | none  | Terminal or inline GitHub comments                 | Review delivered, exit code set                       |

### Finding Schema

Each review agent produces findings in this common format:

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

| Flag              | Effect                                                       |
| ----------------- | ------------------------------------------------------------ |
| `--comment`       | Post inline comments to GitHub PR via `gh` CLI or GitHub MCP |
| `--deep`          | Add threat modeling pass (invokes security-review `--deep`)  |
| `--no-mechanical` | Skip mechanical checks (useful if already run in CI)         |
| `--ci`            | Enable eligibility gate, non-interactive output              |

### Model Tiers

Tiers are abstract labels resolved at runtime from project config. If no config exists, all phases use the current model (no tiering).

| Tier       | Default      | Used By                              |
| ---------- | ------------ | ------------------------------------ |
| `fast`     | haiku-class  | GATE, CONTEXT                        |
| `standard` | sonnet-class | Compliance agent, Architecture agent |
| `strong`   | opus-class   | Bug Detection agent, Security agent  |

### Review Learnings Calibration

Before starting the pipeline, check for a project-specific calibration file:

```bash
cat .harness/review-learnings.md 2>/dev/null
```

If `.harness/review-learnings.md` exists:

1. **Read the Useful Findings section.** Prioritize these categories during review — they have historically caught real issues in this project.
2. **Read the Noise / False Positives section.** De-prioritize or skip these categories — flagging them wastes the author's time and erodes trust in the review process.
3. **Read the Calibration Notes section.** Apply these project-specific overrides to your review judgment. These represent deliberate team decisions, not oversights.

If the file does not exist, proceed with default review focus areas. After completing the review, consider suggesting that the team create `.harness/review-learnings.md` if you notice patterns that would benefit from calibration.
````

2. Do NOT commit yet (partial SKILL.md — will continue in Tasks 3-6)

---

### Task 3: Write SKILL.md — Phase 1 (GATE) and Phase 2 (MECHANICAL)

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md` (append)

1. Append to SKILL.md after the Review Learnings Calibration section:

````markdown
## Pipeline Phases

### Phase 1: GATE

**Tier:** fast
**Mode:** CI only (`--ci` flag). When invoked manually, skip this phase entirely.

Check whether the PR should be reviewed at all. This prevents wasted compute in CI pipelines.

**Checks:**

1. **PR state:** Is the PR closed or merged? → Skip with reason "PR is closed."
2. **Draft status:** Is the PR marked as draft? → Skip with reason "PR is draft."
3. **Trivial change:** Is the diff documentation-only (all changed files are `.md`)? → Skip with reason "Documentation-only change."
4. **Already reviewed:** Has this exact commit range been reviewed before (check for prior review comment from this tool)? → Skip with reason "Already reviewed at {sha}."

```bash
# Check PR state
gh pr view --json state,isDraft,files

# Check if documentation-only
gh pr diff --name-only | grep -v '\.md$' | wc -l  # 0 means docs-only
```

**Exit:** If any check triggers a skip, output the reason and exit with code 0. Otherwise, continue to Phase 2.

---

### Phase 2: MECHANICAL

**Tier:** none (no LLM)
**Mode:** Skipped if `--no-mechanical` flag is set.

Run mechanical checks to establish an exclusion boundary. Any issue caught mechanically is excluded from AI review (Phase 4) to prevent duplicate findings.

**Checks:**

1. **Harness validation:**
   ```bash
   harness validate
   harness check-deps
   harness check-docs
   ```
2. **Security scan:** Run `run_security_scan` MCP tool on changed files. Record findings with rule ID, file, line, and remediation.
3. **Type checking:** Run the project's type checker (e.g., `tsc --noEmit`). Record any type errors.
4. **Linting:** Run the project's linter (e.g., `eslint`). Record any lint violations.
5. **Tests:** Run the project's test suite. Record any failures.

**Output:** A set of mechanical findings (file, line, tool, message). This set becomes the exclusion list for Phase 5.

**Exit:** If any mechanical check fails (harness validate, typecheck, or tests), report the mechanical failures in Strengths/Issues/Assessment format and stop the pipeline. The code has fundamental issues that must be fixed before AI review adds value. Lint warnings and security scan findings do not stop the pipeline — they are recorded for exclusion only.
````

2. Do NOT commit yet

---

### Task 4: Write SKILL.md — Phase 3 (CONTEXT)

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md` (append)

1. Append to SKILL.md after Phase 2:

````markdown
---

### Phase 3: CONTEXT

**Tier:** fast
**Purpose:** Assemble scoped context bundles for each review domain. Each subagent in Phase 4 receives only the context relevant to its domain, not the full diff.

#### Change-Type Detection

Before scoping context, determine the change type. This shapes which review focus areas apply.

1. **Explicit argument:** If invoked with a change type (e.g., `--type feature`), use it.
2. **Commit message prefix:** Parse the most recent commit message for conventional commit prefixes:
   - `feat:` or `feature:` → **feature**
   - `fix:` or `bugfix:` → **bugfix**
   - `refactor:` → **refactor**
   - `docs:` or `doc:` → **docs**
3. **Diff pattern heuristic:** If no prefix is found, examine the diff:
   - New files added + tests added → likely **feature**
   - Small changes to existing files + test added → likely **bugfix**
   - File renames, moves, or restructuring with no behavior change → likely **refactor**
   - Only `.md` files or comments changed → likely **docs**
4. **Default:** If detection is ambiguous, treat as **feature** (the most thorough review).

```bash
# Parse commit message prefix
git log --oneline -1 | head -1

# Check for new files
git diff --name-status HEAD~1 | grep "^A"

# Check if only docs changed
git diff --name-only HEAD~1 | grep -v '\.md$' | wc -l  # 0 means docs-only
```

#### Context Scoping

Scope context per review domain. When a knowledge graph exists at `.harness/graph/`, use graph queries. Otherwise, fall back to file-based heuristics.

| Domain            | With Graph                                                               | Without Graph (Fallback)                                                                |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Compliance**    | Convention files (`CLAUDE.md`, `AGENTS.md`, `.harness/`) + changed files | Convention files + changed files (same — no graph needed)                               |
| **Bug Detection** | Changed files + direct dependencies via `query_graph`                    | Changed files + files imported by changed files (`grep import`)                         |
| **Security**      | Security-relevant paths + data flow traversal via `query_graph`          | Changed files + files containing security-sensitive patterns (auth, crypto, SQL, shell) |
| **Architecture**  | Layer boundaries + import graph via `query_graph` + `get_impact`         | Changed files + `harness check-deps` output                                             |

#### 1:1 Context Ratio Rule

For every N lines of diff, gather approximately N lines of surrounding context:

- **Small diffs (<20 lines):** Gather proportionally more context — aim for 3:1 context-to-diff.
- **Medium diffs (20-200 lines):** Target 1:1 ratio. Read full files containing changes, plus immediate dependencies.
- **Large diffs (>200 lines):** 1:1 ratio is the floor. Prioritize ruthlessly. Flag large diffs as a review concern.

#### Context Gathering Priority Order

Gather context in this order until the ratio is met:

1. **Files directly imported/referenced by changed files** — read the modules the changed code calls or depends on.
2. **Corresponding test files** — find tests for changed code. If tests are missing, note this as a finding.
3. **Spec/design docs mentioning changed components** — search `docs/changes/`, `docs/design-docs/`, `docs/plans/`.
4. **Type definitions used by changed code** — read interfaces, types, schemas consumed or produced.
5. **Recent commits touching the same files** — see Commit History below.

#### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate context:

- `query_graph` — traverse dependency chain from changed files to find all imports and transitive dependencies
- `get_impact` — find all affected tests, docs, and downstream code
- `find_context_for` — assemble review context within token budget, ranked by relevance

Graph queries replace manual grep/find commands and discover transitive dependencies that file search misses. Fall back to file-based commands if no graph is available.

#### Context Assembly Commands

```bash
# 1. Get the diff and measure its size
git diff --stat HEAD~1          # or the relevant commit range
git diff HEAD~1 -- <file>       # per-file diff

# 2. Find imports/references in changed files
grep -n "import\|require\|from " <changed-file>

# 3. Find corresponding test files
find . -name "*<module-name>*test*" -o -name "*<module-name>*spec*"

# 4. Search for spec/design references
grep -rl "<component-name>" docs/changes/ docs/design-docs/ docs/plans/

# 5. Find type definitions
grep -rn "interface\|type\|schema" <changed-file> | head -20
```

#### Commit History Context

Retrieve recent commit history for every affected file:

```bash
# Recent commits touching affected files (5 per file)
git log --oneline -5 -- <affected-file>
```

Use commit history to answer:

- **Is this a hotspot?** Changed 3+ times in last 5 commits → volatile, pay extra attention.
- **Was this recently refactored?** Recent "refactor" commits → check alignment with refactoring direction.
- **Who has been working here?** Multiple authors → look for conflicting assumptions.
- **What was the last change?** Bugfix followed by change in same area → yellow flag.

**Exit:** Context bundles are assembled for each of the four review domains. Continue to Phase 4.
````

2. Do NOT commit yet

---

### Task 5: Write SKILL.md — Phase 4 (FAN-OUT)

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md` (append)

1. Append to SKILL.md after Phase 3:

```markdown
---

### Phase 4: FAN-OUT

**Tier:** mixed (see per-agent tiers below)
**Purpose:** Run four parallel review subagents, each with domain-scoped context from Phase 3. Each agent produces findings in the `ReviewFinding` schema.

#### Compliance Agent (standard tier)

Reviews adherence to project conventions, standards, and documentation requirements.

**Input:** Compliance context bundle (convention files + changed files + change type)

**Focus by change type:**

*Feature:*
- [ ] **Spec alignment:** Does the implementation match the spec/design doc? Are all specified behaviors present?
- [ ] **API surface:** Are new public interfaces minimal and well-named? Could any new export be kept internal?
- [ ] **Backward compatibility:** Does this break existing callers? If so, is the migration path documented?

*Bugfix:*
- [ ] **Root cause identified:** Does the fix address the root cause, not just the symptom?
- [ ] **Original issue referenced:** Does the commit or PR reference the bug report or issue number?
- [ ] **No collateral changes:** Does the fix change only what is necessary?

*Refactor:*
- [ ] **Behavioral equivalence:** Do all existing tests still pass without modification?
- [ ] **No functionality changes:** Does the refactor introduce any new behavior?

*Docs:*
- [ ] **Accuracy vs. current code:** Do documented behaviors match what the code actually does?
- [ ] **Completeness:** Are all public interfaces documented?
- [ ] **Consistency:** Does new documentation follow existing style and terminology?
- [ ] **Links valid:** Do all internal links resolve?

**Output:** `ReviewFinding[]` with `domain: 'compliance'`

---

#### Bug Detection Agent (strong tier)

Reviews for logic errors, edge cases, and correctness issues.

**Input:** Bug detection context bundle (changed files + dependencies)

**Focus areas:**

- [ ] **Edge cases:** Boundary conditions (empty input, max values, null, concurrent access)
- [ ] **Error handling:** Errors handled at appropriate level, helpful messages, no silent swallowing
- [ ] **Logic errors:** Off-by-one, incorrect boolean logic, missing early returns
- [ ] **Race conditions:** Concurrent access to shared state, missing locks or atomic operations
- [ ] **Resource leaks:** Unclosed handles, missing cleanup in error paths
- [ ] **Type safety:** Type mismatches, unsafe casts, missing null checks
- [ ] **Test coverage:** Tests for happy path, error paths, and edge cases. Coverage meaningful, not just present.
- [ ] **Regression tests:** For bugfixes — test that would have caught the bug before the fix

**Output:** `ReviewFinding[]` with `domain: 'bug'`

---

#### Security Agent (strong tier)

Reviews for security vulnerabilities using OWASP baseline plus stack-adaptive focus.

**Input:** Security context bundle (security-relevant paths + data flows)

If `--deep` flag is set, additionally invoke `security-review --deep` for threat modeling.

**Focus areas:**

1. **Semantic security review** (issues mechanical scanners cannot catch):
   - User input flowing through multiple functions to dangerous sinks (SQL, shell, HTML)
   - Missing authorization checks on new or modified endpoints
   - Sensitive data exposed in logs, error messages, or API responses
   - Authentication bypass paths introduced by the change
   - Insecure defaults in new configuration options

2. **Stack-adaptive focus:** Based on the project's tech stack:
   - Node.js: prototype pollution, ReDoS, path traversal
   - React: XSS, dangerouslySetInnerHTML, state injection
   - Go: race conditions, integer overflow, unsafe pointer
   - Python: pickle deserialization, SSTI, command injection

3. **CWE references:** Include CWE IDs for confirmed vulnerabilities.

Security findings with confirmed vulnerabilities are always `severity: 'critical'`.

**Output:** `ReviewFinding[]` with `domain: 'security'`

---

#### Architecture Agent (standard tier)

Reviews for architectural violations, dependency direction, and design pattern compliance.

**Input:** Architecture context bundle (layer boundaries + import graph)

**Focus areas:**

- [ ] **Layer compliance:** Does the code respect the project's architectural layers? Are imports flowing in the correct direction?
- [ ] **Dependency direction:** Do modules depend on abstractions, not concretions? (Dependency Inversion)
- [ ] **Single Responsibility:** Does each module have one reason to change?
- [ ] **Open/Closed:** Can behavior be extended without modifying existing code?
- [ ] **Pattern consistency:** Does the code follow established codebase patterns? If introducing a new pattern, is it justified?
- [ ] **Separation of concerns:** Business logic separated from infrastructure? Each function/module does one thing?
- [ ] **DRY violations:** Duplicated logic that should be extracted — but NOT intentional duplication of things that will diverge.
- [ ] **Performance preserved:** Could restructuring introduce regressions (extra allocations, changed query patterns)?

**Output:** `ReviewFinding[]` with `domain: 'architecture'`

**Exit:** All four agents have returned their findings. Continue to Phase 5.
```

2. Do NOT commit yet

---

### Task 6: Write SKILL.md — Phases 5-7, Roles, Harness Integration, Gates, Escalation, Examples

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md` (append)

1. Append to SKILL.md after Phase 4:

````markdown
---

### Phase 5: VALIDATE

**Tier:** none (mechanical)
**Purpose:** Remove false positives by cross-referencing AI findings against mechanical results and graph reachability.

**Steps:**

1. **Mechanical exclusion:** For each finding from Phase 4, check if the same file + line range was already flagged by a mechanical check in Phase 2. If so, discard the AI finding — the mechanical check is authoritative and the issue is already reported.

2. **Graph reachability validation (if graph available):** For findings that claim an issue affects other parts of the system (e.g., "this change breaks callers"), verify via `query_graph` that the claimed dependency path exists. Discard findings with invalid reachability claims.

3. **Import-chain heuristic (fallback, no graph):** Follow imports 2 levels deep from the flagged file. If the finding claims impact on a file not reachable within 2 import hops, downgrade severity to `suggestion` rather than discarding.

**Exit:** Validated finding set. Continue to Phase 6.

---

### Phase 6: DEDUP + MERGE

**Tier:** none (mechanical)
**Purpose:** Eliminate redundant findings across agents and produce the final finding list.

**Steps:**

1. **Group by location:** Group findings by `file` + overlapping `lineRange`. Two findings overlap if their line ranges intersect or are within 3 lines of each other.

2. **Merge overlapping findings:** When multiple agents flag the same location:
   - Keep the highest `severity` from any agent
   - Combine `evidence` arrays from all agents
   - Preserve the `rationale` with the strongest justification
   - Merge `domain` tags (a finding can be both `bug` and `security`)
   - Generate a single merged `id`

3. **Assign final severity:**
   - **Critical** — Must fix before merge. Bugs, security vulnerabilities, failing harness checks, architectural violations that break boundaries.
   - **Important** — Should fix before merge. Missing error handling, missing tests for critical paths, unclear naming.
   - **Suggestion** — Consider for improvement. Style preferences, minor optimizations, alternative approaches. Does not block merge.

**Exit:** Deduplicated, severity-assigned finding list. Continue to Phase 7.

---

### Phase 7: OUTPUT

**Tier:** none
**Purpose:** Deliver the review in the requested format.

#### Terminal Output (default)

Structure the review as:

**Strengths:** What is done well. Be specific. "Clean separation between X and Y" is useful. "Looks good" is not.

**Issues:** List each finding from Phase 6, grouped by severity:

- **Critical:** [findings with severity 'critical']
- **Important:** [findings with severity 'important']
- **Suggestion:** [findings with severity 'suggestion']

For each issue, provide:

1. The specific location (file and line range)
2. What the problem is (title)
3. Why it matters (rationale)
4. A suggested fix (if available)

**Assessment:** One of:

- **Approve** — No critical or important issues. Ready to merge.
- **Request Changes** — Critical or important issues must be addressed.
- **Comment** — Observations only, no blocking issues.

**Exit code:** 0 for Approve/Comment, 1 for Request Changes.

#### Inline GitHub Comments (`--comment` flag)

When `--comment` is set, post findings as inline PR comments via `gh` CLI or GitHub MCP:

- **Small fixes** (suggestion is < 10 lines): Post as committable suggestion block using GitHub's suggestion syntax.
- **Large fixes** (suggestion is >= 10 lines or no concrete suggestion): Post description + rationale as a regular comment.
- **Summary comment:** Post the Strengths/Issues/Assessment as a top-level PR review comment.

```bash
# Post a review with inline comments
gh pr review --event APPROVE|REQUEST_CHANGES|COMMENT --body "<summary>"

# Post inline comment with suggestion
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --field body="<rationale>\n\`\`\`suggestion\n<fix>\n\`\`\`" \
  --field path="<file>" --field line=<line>
```

---

## Role A: Requesting a Review

_This section is not part of the pipeline. It documents the process for requesting a review from others._

When you have completed work and need it reviewed:

1. **Prepare the review context:**
   - Commit range (exact SHAs or branch diff)
   - Description (WHAT changed and WHY — not a commit-by-commit retelling)
   - Plan reference (link to spec/plan if applicable)
   - Test evidence (`harness validate` and test suite results)
   - Harness check results (`harness validate`, `harness check-deps`)

2. **Dispatch the review:** Identify the right reviewer, provide the context package, state what kind of feedback you want.

3. **Wait.** Do not modify code under review. Note issues but do not push fixes until review is complete.

---

## Role C: Responding to Review Feedback

_This section is not part of the pipeline. It documents the process for responding to review feedback._

1. **Read all feedback first.** Understand the full picture before responding.

2. **Verify before implementing.** For each piece of feedback:
   - Do you understand it? If not, ask for clarification.
   - Is it correct? Verify the claim — reviewers make mistakes too.
   - Is it actionable? Vague feedback requires clarification.

3. **Technical rigor over social performance:**
   - Do NOT agree with feedback just to be agreeable. Push back with evidence if wrong.
   - Do NOT implement every suggestion. Apply YAGNI.
   - Do NOT make changes you do not understand. Ask for explanation.
   - DO acknowledge when feedback is correct.
   - DO push back when feedback contradicts the approved plan/spec.

4. **Implement fixes:** For each accepted piece of feedback: make the change, run tests, run `harness validate` and `harness check-deps`, commit with a message referencing the review feedback.

5. **Re-request review** with summary of changes, which feedback was addressed vs. pushed back on, and fresh harness check results.

---

## Harness Integration

- **`harness validate`** — Run in Phase 2 (MECHANICAL). Must pass for the pipeline to continue to AI review.
- **`harness check-deps`** — Run in Phase 2 (MECHANICAL). Failures are Critical issues that stop the pipeline.
- **`harness check-docs`** — Run in Phase 2 (MECHANICAL). Documentation drift findings are recorded for the exclusion set.
- **`harness cleanup`** — Optional check during Phase 2 for entropy accumulation in changed files.
- **Graph queries** — Used in Phase 3 (CONTEXT) for dependency-scoped context and in Phase 5 (VALIDATE) for reachability verification. Graceful fallback when no graph exists.

## Success Criteria

- The pipeline runs all 7 phases in order when invoked manually (skipping GATE)
- The pipeline runs all 7 phases including GATE when invoked with `--ci`
- Mechanical failures in Phase 2 stop the pipeline before AI review (Phase 4)
- Each Phase 4 subagent receives only its domain-scoped context, not the full diff
- All findings use the ReviewFinding schema
- Mechanical findings from Phase 2 are excluded from Phase 4 output in Phase 5
- Cross-agent duplicate findings are merged in Phase 6
- Terminal output uses Strengths/Issues/Assessment format with Critical/Important/Suggestion severity
- `--comment` posts inline GitHub comments with committable suggestion blocks for small fixes
- `--deep` adds threat modeling to the Security agent
- No code merges with Critical issues unresolved
- No code merges with failing harness checks
- Response to feedback (Role C) is verified before implementation
- Pushback on incorrect feedback is evidence-based

## Examples

### Example: Pipeline Review of a New API Endpoint

**Phase 1 (GATE):** Skipped — manual invocation.

**Phase 2 (MECHANICAL):** `harness validate` passes. `harness check-deps` passes. Security scan finds no issues. `tsc --noEmit` passes. Lint passes.

**Phase 3 (CONTEXT):** Change type detected as `feature` (commit prefix `feat:`). Context bundles assembled:

- Compliance: `CLAUDE.md` + changed files
- Bug detection: `api/routes/users.ts`, `services/user-service.ts`, `db/queries.ts`
- Security: `api/routes/users.ts` (endpoint), `services/user-service.ts` (data flow)
- Architecture: import graph showing `routes → services → db` layers

**Phase 4 (FAN-OUT):** Four agents run in parallel:

- Compliance agent: 0 findings (spec alignment confirmed)
- Bug detection agent: 1 finding (missing duplicate email handling in createUser)
- Security agent: 0 findings (no vulnerabilities detected)
- Architecture agent: 1 finding (routes/users.ts imports directly from db/queries.ts)

**Phase 5 (VALIDATE):** No mechanical exclusions apply. Architecture finding validated by `check-deps` output showing layer violation.

**Phase 6 (DEDUP+MERGE):** No overlaps — 2 distinct findings in different files.

**Phase 7 (OUTPUT):**

**Strengths:**

- Clean separation between route handler and service logic
- Input validation using Zod schemas with clear error messages
- Comprehensive test coverage including error paths

**Issues:**

**Critical:**

- `api/routes/users.ts:12-15` — Direct import from `db/queries.ts` bypasses service layer. Must route through `services/user-service.ts`. (domain: architecture, validatedBy: heuristic)

**Important:**

- `services/user-service.ts:45` — `createUser` does not handle duplicate email. Database will throw constraint violation surfacing as 500. Should catch and return 409. (domain: bug, validatedBy: heuristic)

**Suggestion:** (none)

**Assessment:** Request Changes — one critical layer violation and one important missing error handler.

## Gates

- **Never skip mechanical checks without `--no-mechanical`.** If mechanical checks have not run (in CI or locally), they must run in Phase 2 before AI review.
- **Never merge with failing harness checks.** `harness validate` and `harness check-deps` must pass. This is a Critical issue, always.
- **Never implement feedback without verification.** Before changing code based on review feedback, verify the feedback is correct. Run the scenario. Read the code. Do not blindly comply.
- **Never agree performatively.** "Sure, I'll change that" without understanding why is forbidden. Every change must be understood.
- **Never skip the YAGNI check.** Every suggestion must answer: "Does this serve a current, concrete need?" Speculative improvements are rejected.

## Escalation

- **When reviewers disagree:** If two reviewers give contradictory feedback, escalate to the human or tech lead.
- **When review feedback changes the plan:** If feedback requires altering the approved plan or spec, pause the review. The plan must be updated first.
- **When you cannot reproduce a reported issue:** Ask the reviewer for exact reproduction steps.
- **When review is taking more than 2 rounds:** Something is fundamentally misaligned. Stop and discuss the approach synchronously.
- **When harness checks fail and you believe the check is wrong:** Do not override or skip. File an issue against the harness configuration.
- **When the pipeline produces a false positive after validation:** Add the pattern to `.harness/review-learnings.md` in the Noise / False Positives section for future calibration.
````

2. Do NOT commit yet

---

### Task 7: Copy to gemini-cli, validate, and commit

[checkpoint:human-verify] — Review the complete SKILL.md before committing.

**Depends on:** Tasks 1-6
**Files:** all four files

1. Copy claude-code files to gemini-cli:

   ```bash
   cp agents/skills/claude-code/harness-code-review/SKILL.md agents/skills/gemini-cli/harness-code-review/SKILL.md
   cp agents/skills/claude-code/harness-code-review/skill.yaml agents/skills/gemini-cli/harness-code-review/skill.yaml
   ```

2. Verify byte-identical copies:

   ```bash
   diff agents/skills/claude-code/harness-code-review/SKILL.md agents/skills/gemini-cli/harness-code-review/SKILL.md
   diff agents/skills/claude-code/harness-code-review/skill.yaml agents/skills/gemini-cli/harness-code-review/skill.yaml
   ```

3. Run: `pnpm harness validate`

4. Stage all four files together (both platforms — preserves Prettier parity):

   ```bash
   git add agents/skills/claude-code/harness-code-review/SKILL.md \
          agents/skills/claude-code/harness-code-review/skill.yaml \
          agents/skills/gemini-cli/harness-code-review/SKILL.md \
          agents/skills/gemini-cli/harness-code-review/skill.yaml
   ```

5. Commit: `feat(skills): restructure harness-code-review as 7-phase pipeline`

6. Run: `pnpm harness validate` (post-commit verification)

## Traceability

| Observable Truth                       | Delivered By                                    |
| -------------------------------------- | ----------------------------------------------- |
| 1. Seven pipeline phases in SKILL.md   | Tasks 3, 4, 5, 6                                |
| 2. ReviewFinding schema                | Task 2                                          |
| 3. Four flags documented               | Task 2                                          |
| 4. Model tier abstraction              | Task 2                                          |
| 5. All existing logic mapped to phases | Tasks 3, 4, 5, 6                                |
| 6. skill.yaml flags and version        | Task 1                                          |
| 7. gemini-cli SKILL.md parity          | Task 7                                          |
| 8. gemini-cli skill.yaml parity        | Task 7                                          |
| 9. harness validate passes             | Task 7                                          |
| 10. Clear phase-to-capability mapping  | Tasks 2-6 (pipeline table + per-phase sections) |
