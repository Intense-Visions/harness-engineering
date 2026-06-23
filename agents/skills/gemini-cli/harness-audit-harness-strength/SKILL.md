# Harness Audit: Harness Strength

> Mechanically audit whether a project's harness is load-bearing. Orchestrates the deterministic check-harness-strength engine; interprets results. Not a deep/AI review.

## When to Use

- On a milestone gate, to confirm the harness still constrains rather than merely decorates the project
- When adding the strength audit as a required CI check, so the seven STRENGTH patterns block the merge instead of being prose advice
- When validating a harness-distribution (toolkit) repo before shipping templates downstream — to catch a default that would weaken every adopter
- When a reviewer suspects a gate "passes" without doing anything (a snapshot that asserts `passed: true` for a check it never ran)
- NOT for deep security review — use `harness-security-review` (semantic, AI-assisted)
- NOT for design-system drift — use `detect-design-drift`
- NOT for reimplementing pattern detection by hand — the engine (`HarnessStrengthAuditor`) owns detection. This skill runs it and interprets the output.

## Process

This skill ORCHESTRATES `harness check-harness-strength`. It never re-greps configs, never re-parses hooks, and never re-derives findings. The engine reads the project once and returns a structured `AuditResult`; the skill's job is to run it with the right mode/severity and turn the JSON into an actionable report.

### Phase 1: SCAN — Run the engine

1. **Resolve the project root.** Use the provided `path` argument, else the current working directory.

2. **Resolve the mode.**
   - If `--toolkit` or `--adopter` (or `--mode toolkit|adopter`) is supplied, honor it. Explicit mode wins.
   - Otherwise auto-detect: treat the repo as **toolkit** when it is a harness distribution — both `templates/` and `agents/skills/` exist at the root. Otherwise **adopter**.
   - Do not inspect config files to "double-check" the mode. The engine resolves and reports the mode it used.

3. **Invoke the command** via Bash, requesting JSON:

   ```bash
   harness check-harness-strength [--mode <adopter|toolkit>] [--severity <error|warning|info>] [--report-only] --json
   ```

   The `--json` payload is the raw structured `AuditResult` (score, tier, mode, findings with `id`, `gearPiece`, `severity`, `message`, `remediation`, and file:line evidence). Parse this — do not re-derive it.

4. **Do NOT inspect config files by hand.** The engine reads `harness.config.json`, hook profiles, baselines, snapshots, and tier defaults exactly once. Hand-grepping `.husky/pre-commit` or `harness.config.json` to "confirm" a finding reimplements detection and violates the core decision behind this skill (ADR 0039 / spec D1).

### Phase 2: DETECT — Interpret findings

1. **Map each finding to its STRENGTH pattern** using the JSON `id` and `gearPiece` fields. Every finding the engine emits corresponds to exactly one of the seven patterns below. Do not invent findings the engine did not emit, and do not silence findings it did.

2. **The seven STRENGTH patterns** (the engine's rule registry — for interpretation only; the engine, not the skill, decides which fire):

   | ID           | Gear piece              | Pattern                                                              | Default |
   | ------------ | ----------------------- | -------------------------------------------------------------------- | ------- |
   | STRENGTH-001 | blocking-gate           | Hook documented "never blocks"/"always exits 0" in an active profile | error   |
   | STRENGTH-002 | regression-baseline     | Pre-commit auto-updates baselines/thresholds on regression           | error   |
   | STRENGTH-003 | skip-discipline         | `--skip` list > 2 categories without inline justification            | warning |
   | STRENGTH-004 | architecture-thresholds | `layers` defined but `architecture.thresholds` empty/absent          | error   |
   | STRENGTH-005 | tier-default            | Init/config defaults to lowest tier (`basic`)                        | warning |
   | STRENGTH-006 | review-gate             | Baseline-update PR auto-approved without independent review          | error   |
   | STRENGTH-007 | snapshot-honesty        | `passed:true` in health snapshot whose `signals[]` names that check  | error   |

3. **Attach evidence.** Each finding carries a `file:line` (or config-key) reference and a remediation string from the engine. Surface them verbatim — do not paraphrase the remediation.

### Phase 3: SCORE/REPORT

1. **Surface the score and tier.** The engine returns a 0-100 strength score and a tier label:
   - `solid` — score >= 85
   - `at-risk` — score 50-84
   - `theatre` — score < 50

2. **Report format** (mirror of the security-scan report block):

   ```
   Harness Strength: [PASS/FAIL] — tier: <solid|at-risk|theatre> (score N/100, mode <adopter|toolkit>)
   Findings: <count>  (Errors: N | Warnings: N | Info: N)

   [STRENGTH-00N] <gearPiece> <file:line> (severity)
     <message>
     Remediation: <engine remediation string>
   ```

3. **PASS/FAIL.** FAIL if any error-severity finding survives the severity threshold, unless `--report-only` was passed (then exit softens to PASS but findings are still listed). Otherwise PASS.

## Gates

- **Error-severity findings are blocking.** The report is FAIL and the exit is non-zero when any error-severity finding survives filtering — unless `--report-only` was explicitly requested. Do not report PASS over an unsuppressed error finding.
- **No reimplementation.** The skill must run `harness check-harness-strength` and interpret its JSON. It must never hand-grep hooks, hand-parse `harness.config.json`, or re-derive a score. Reimplementing detection violates ADR 0039.
- **"Not evaluable" is not a pass.** When an input the engine needs is absent (e.g., no hook profile, no snapshot), the engine reports that state. Surface it as-is. Do not convert "could not evaluate" into "passed."
- **Mechanical only.** No AI judgment about whether a weakness "really matters." The patterns are deterministic; the engine decides what fires.

## Escalation

- **Disputed finding / false positive:** Do not suppress by editing files or skipping the rule in the skill. Adjust severity via config — `audit.harnessStrength.severities` in `harness.config.json` (e.g., downgrade STRENGTH-003 to `info` for a justified wide `--skip`). Document the rationale alongside the override.
- **Engine misses a known weakness:** This skill cannot add detection. A missing pattern is engine work — file a new `StrengthRule` (`{ id, gearPiece, defaultSeverity, appliesIn(mode), detect(ctx) }`) in `packages/core/src/harness-strength/`. Out of scope for the skill.
- **Mode mis-detected:** If auto-detection picks the wrong mode (e.g., a repo with `templates/` that is not a distribution), pass `--mode adopter` (or `--toolkit`) explicitly. Do not work around it by hand-editing detection.
- **Engine throws or the build is stale:** If `harness check-harness-strength` errors (command not found / not in the built CLI), the dist may be stale. Rebuild the CLI and re-run. Do not substitute a manual config read for the engine.

## Rationalizations to Reject

### Universal

These reasoning patterns sound plausible but lead to bad outcomes. Reject them.

- **"It's probably fine"** — "Probably" is not evidence. Run the engine and cite the result.
- **"This is best practice"** — Best practice in what context? Cite the source and confirm it applies to this codebase.
- **"We can fix it later"** — If it is worth flagging, it is worth documenting now with a concrete follow-up plan.

### Domain-Specific

| Rationalization                                            | Reality                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The config looks fine when I read it"                     | The engine exists because manual reading misses these patterns — that is the whole point of D1. Reading is not running. Run `harness check-harness-strength`. |
| "It only warns, not errors, so it's fine"                  | A gate that warns but does not stop IS STRENGTH-001 — this is the recursion item the audit was built to catch. Do not normalize "warns but doesn't block."    |
| "I'll re-grep the hooks myself to double-check the engine" | Reimplementing detection violates ADR 0039 / spec D1. The engine is the single source of truth — trust and interpret its output, do not shadow it.            |
| "Score is 70, that's a passing grade"                      | 70 is `at-risk`, not `solid`. Tier labels are thresholds, not letter grades. Below 85 means the harness has load-bearing gaps.                                |
| "No error findings, so I can skip reading the warnings"    | Warnings (STRENGTH-003, -005) are erosion signals — a `basic` tier default or an unjustified wide `--skip` weakens every future run. Surface them.            |

## Success Criteria

- The engine (`harness check-harness-strength`) ran and produced a score, tier label, and findings (or a clean result).
- Every finding is interpreted against the seven-pattern table, with the engine's file:line evidence and remediation surfaced verbatim.
- The exit code / PASS-FAIL reflects the gate (error-severity findings fail unless `--report-only`).
- No manual config inspection was substituted for the engine — the report is derived entirely from the command's `--json` output.
- "Not evaluable" states are surfaced as-is, never converted to passes.

## Evidence Requirements

When this skill makes claims about existing code, architecture, or behavior, it MUST cite evidence using one of:

1. **File reference:** `file:line` format (e.g., `.husky/pre-commit:12`) — taken from the engine's finding, not re-derived.
2. **Code pattern reference:** `file` with description (e.g., `harness.config.json` — "architecture.layers defined, thresholds absent").
3. **Test/command output:** Inline or referenced output from the `harness check-harness-strength --json` run.
4. **Session evidence:** Write to the `evidence` session section via `manage_state`.

**Uncited claims:** Technical assertions without citations MUST be prefixed with `[UNVERIFIED]`. Example: `[UNVERIFIED] The pre-commit hook auto-updates baselines`.

## Harness Integration

- **`harness check-harness-strength`** — The CLI command this skill runs and interprets. Options: `--mode <adopter|toolkit>`, `--toolkit`/`--adopter` shortcuts, `--severity <error|warning|info>` (default `warning`), `--report-only`, `--json`.
- **`HarnessStrengthAuditor`** — Core class from `@harness-engineering/core` that builds a `ProjectContext` once, runs the applicable `StrengthRule`s, and aggregates the score/tier/findings. The skill never instantiates it directly; it goes through the command.
- **`harness.config.json` → `audit.harnessStrength.severities`** — Per-pattern severity overrides. The supported escalation path for false positives — never suppress by editing source.
- **`docs/standard/article-failure-patterns.md`** — Narrative companion documenting the seven patterns (forthcoming — downstream item; may not exist yet).

## Examples

### Example: Clean toolkit-mode run

**Input:** A harness-distribution repo (`templates/` and `agents/skills/` present), run at a milestone gate. `harness check-harness-strength --toolkit --json`.

**Output:**

```
Harness Strength: PASS — tier: solid (score 100/100, mode toolkit)
Findings: 0  (Errors: 0 | Warnings: 0 | Info: 0)
```

Every gear piece is load-bearing: no "never blocks" hook, baselines are not auto-updated on regression, architecture thresholds are set, the init default is not `basic`, baseline-update PRs require independent review, and no snapshot claims a check passed that it never ran.

### Example: Findings detected (adopter mode)

**Input:** An adopter repo, run with default severity. `harness check-harness-strength --json`.

**Output:**

```
Harness Strength: FAIL — tier: at-risk (score 62/100, mode adopter)
Findings: 2  (Errors: 2 | Warnings: 0 | Info: 0)

[STRENGTH-001] blocking-gate .husky/pre-commit:12 (error)
  Active pre-commit profile documents "always exits 0" — the gate reports but never blocks.
  Remediation: Remove the unconditional `exit 0`; let failing checks return a non-zero status.

[STRENGTH-004] architecture-thresholds harness.config.json (error)
  architecture.layers is defined but architecture.thresholds is empty — layer rules cannot be enforced.
  Remediation: Set architecture.thresholds (e.g. maxModuleLines, maxDependencyDepth) so the layer
               definitions become enforceable, or remove the unused layers block.
```

Two error-severity findings → FAIL. STRENGTH-001 is the recursion item: a hook that runs but cannot block. Run with `--report-only` only when you explicitly want to surface findings without failing the build (e.g., a first baseline-capture run) — and never to normalize the weakness.

## Skill Test Scenarios

### Scenario 1: Red Flag — "I'll re-grep the hooks myself to double-check the engine"

Input: The agent has the `harness check-harness-strength --json` output in hand but is about to open `.husky/pre-commit` and grep it by hand to "confirm" the STRENGTH-001 finding.
Expected: Agent stops, cites the no-reimplementation gate (ADR 0039 / spec D1), and interprets the engine's JSON instead of hand-grepping the hook.

### Scenario 2: Rationalization — "it only warns, not errors, so it's fine"

Input: The engine reports a documented "never blocks" pre-commit profile, and the agent is tempted to treat it as acceptable because nothing currently fails the build.
Expected: Agent rejects the rationalization, recognizes that "warns but doesn't stop" IS STRENGTH-001 (the recursion item), and surfaces it as a finding rather than normalizing it.

### Scenario 3: Gate — error-severity STRENGTH-001 finding present without `--report-only`

Input: The `--json` output contains an error-severity STRENGTH-001 finding, `--report-only` was not passed, and the agent is about to summarize the run as PASS.
Expected: Agent halts, reports FAIL with a non-zero exit, lists the finding with its file:line evidence and remediation, and does not proceed past the gate.
