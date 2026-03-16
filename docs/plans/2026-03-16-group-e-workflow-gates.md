# Group E: Workflow Gates — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mechanical verification gates that enforce workflow discipline — a binary verify skill, EARS requirement syntax in planning, a phase-gate CLI command, and typed workflow orchestration.

**Architecture:** New skill at `agents/skills/claude-code/harness-verify/` (quick gate), EARS patterns added to harness-planning SKILL.md, new `check-phase-gate` CLI command in `packages/cli/`, workflow types in `packages/types/`, workflow runner in `packages/core/`. After E1, complete deferred A6 (unified integrity gate).

**Tech Stack:** TypeScript, Zod, Commander, Vitest, YAML, Markdown

**Spec:** `docs/specs/2026-03-16-research-roadmap-design.md` (Group E section)

**Implementation order:** E1 → A6 (deferred completion) → E2 → E3 → E4

---

## Chunk 1: E1 — Verify Skill (Quick Gate)

New skill at `agents/skills/claude-code/harness-verify/`. Binary pass/fail gate that auto-detects and runs test, lint, typecheck commands. Complementary to the existing `harness-verification` (deep audit) — this is the lightweight quick gate.

### Task 1: Create harness-verify skill.yaml

**Files:**
- Create: `agents/skills/claude-code/harness-verify/skill.yaml`

- [ ] **Step 1: Create skill.yaml**

Create `agents/skills/claude-code/harness-verify/skill.yaml`:

```yaml
name: harness-verify
version: "1.0.0"
description: Binary pass/fail quick gate — runs test, lint, typecheck commands and returns structured result
triggers:
  - manual
  - on_task_complete
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
cli:
  command: harness skill run harness-verify
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-verify
    path: string
type: rigid
cognitive_mode: meticulous-verifier
phases:
  - name: detect
    description: Auto-detect project commands from package.json, Makefile, or conventions
    required: true
  - name: execute
    description: Run test, lint, typecheck commands
    required: true
  - name: report
    description: Return structured pass/fail result
    required: true
state:
  persistent: false
  files: []
depends_on: []
```

- [ ] **Step 2: Run `harness validate`**
- [ ] **Step 3: Commit** — `feat(skills): add harness-verify skill.yaml — quick gate metadata`

### Task 2: Create harness-verify SKILL.md

**Files:**
- Create: `agents/skills/claude-code/harness-verify/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Create `agents/skills/claude-code/harness-verify/SKILL.md`:

```markdown
# Harness Verify

> Binary pass/fail quick gate. Runs test, lint, typecheck — returns structured result. No judgment calls, no deep analysis. Pass or fail.

## When to Use
- After completing any implementation task (the quick "done" check)
- As the final step in any code-producing skill
- Before claiming a task is complete
- When `on_task_complete` triggers fire
- NOT for deep verification of milestones or PRs (use harness-verification for that)
- NOT for code review (use harness-code-review for that)

### Relationship to harness-verification

| Tier | Skill | When | What |
|------|-------|------|------|
| **Quick gate** | harness-verify (this skill) | After every task | test + lint + typecheck → binary pass/fail |
| **Deep audit** | harness-verification | Milestones, PRs, on-demand | EXISTS → SUBSTANTIVE → WIRED (3-level evidence) |

Use this skill for fast, mechanical, binary checks. Use harness-verification when you need deep evidence-based audit with artifact tracing.

## Process

### Phase 1: DETECT — Auto-Detect Project Commands

Scan the project root to discover available commands. Check in this order:

1. **package.json scripts** (highest priority):
   - Read `package.json` and inspect the `scripts` field
   - Map: `test` → test command, `lint` → lint command, `typecheck` or `type-check` or `tsc` → typecheck command
   - Prefer `pnpm` runner if `pnpm-lock.yaml` exists, `npm` otherwise

2. **Makefile** (second priority):
   - Read `Makefile` and look for targets: `test`, `lint`, `typecheck`, `check`
   - Use `make <target>` as the command

3. **Convention fallbacks** (last resort):
   - Test: `pnpm test`, `npm test`, `pytest`, `go test ./...`
   - Lint: `pnpm lint`, `npm run lint`, `ruff check .`, `golangci-lint run`
   - Typecheck: `pnpm typecheck`, `tsc --noEmit`, `mypy .`

Record which commands were detected and which were not found. A missing command is not a failure — it means that check is skipped.

### Phase 2: EXECUTE — Run Commands

Run each detected command in sequence. For each command:

1. Execute the command from the project root
2. Capture the exit code
3. Capture stdout and stderr
4. Record pass (exit code 0) or fail (non-zero exit code)

**Order:** typecheck → lint → test

**Stop behavior:** Run all commands regardless of individual failures. Do not short-circuit on the first failure — the full picture is more useful than an early exit.

### Phase 3: REPORT — Return Structured Result

Produce the verification report in this exact format:

```
Verification: [PASS/FAIL]
- Tests: [PASS/FAIL/SKIPPED] ([summary of output — e.g., "42/42 passed" or "3 failed"])
- Lint: [PASS/FAIL/SKIPPED] ([summary — e.g., "0 warnings" or "12 errors"])
- Types: [PASS/FAIL/SKIPPED] ([summary — e.g., "no errors" or "7 type errors"])
```

Overall verdict is PASS only if all executed checks pass. SKIPPED checks do not cause failure.

If any check fails, include the first 20 lines of error output below the summary for quick diagnosis.

## Deterministic Checks

This skill is entirely deterministic. There are no LLM judgment calls. Every check is binary:

- Exit code 0 = PASS
- Exit code non-zero = FAIL
- Command not found = SKIPPED

## Success Criteria

- All detected commands were executed
- Report follows the structured format exactly
- Overall verdict correctly reflects individual results
- Failed checks include error output summary
- No subjective language in the report

## Gates

- **No judgment calls.** This skill does not assess code quality, suggest improvements, or make recommendations. It runs commands and reports results. Period.
- **No skipping detected commands.** If a command was detected, it must be run. Do not skip a check because "it probably passes."
- **Fresh execution only.** Do not use cached or remembered results. Run every command in the current session.

## Escalation

- **When a command hangs or times out:** Kill after 120 seconds. Report as FAIL with "timed out after 120s."
- **When the project has no detectable commands:** Report all three checks as SKIPPED. Overall verdict is PASS (no checks to fail). Note in the report: "No test/lint/typecheck commands detected."
- **When you need deeper analysis:** Escalate to harness-verification (deep audit) or harness-code-review (quality review). This skill is not the right tool for deep analysis.
```

- [ ] **Step 2: Run `harness validate`**
- [ ] **Step 3: Commit** — `feat(skills): add harness-verify SKILL.md — binary quick gate skill`

---

## Chunk 2: A6 — Complete Deferred Unified Integrity Gate

Now that E1 (harness-verify) exists, complete the A6 unified integrity gate that was stubbed during Group A. A6 is a meta-skill that chains: verify (quick gate) → AI review → unified report.

### Task 3: Create harness-integrity skill.yaml

**Files:**
- Create: `agents/skills/claude-code/harness-integrity/skill.yaml`

- [ ] **Step 1: Create skill.yaml**

Create `agents/skills/claude-code/harness-integrity/skill.yaml`:

```yaml
name: harness-integrity
version: "1.0.0"
description: Unified integrity gate — chains verify (quick gate) with AI review into a single report
triggers:
  - manual
  - on_pr
  - on_milestone
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
cli:
  command: harness skill run harness-integrity
  args:
    - name: path
      description: Project root path
      required: false
    - name: change-type
      description: "Type of change: feature, bugfix, refactor, docs"
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-integrity
    path: string
type: rigid
cognitive_mode: meticulous-verifier
phases:
  - name: verify
    description: Run harness-verify quick gate (test, lint, typecheck)
    required: true
  - name: review
    description: Run change-type-aware AI review
    required: true
  - name: report
    description: Produce unified integrity report
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-verify
  - harness-code-review
```

- [ ] **Step 2: Run `harness validate`**
- [ ] **Step 3: Commit** — `feat(skills): add harness-integrity skill.yaml — unified gate metadata`

### Task 4: Create harness-integrity SKILL.md

**Files:**
- Create: `agents/skills/claude-code/harness-integrity/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Create `agents/skills/claude-code/harness-integrity/SKILL.md`:

```markdown
# Harness Integrity

> Unified integrity gate. Single invocation runs the full pipeline: mechanical verification → AI review → unified report. The one command that answers "is this ready?"

## When to Use
- Before creating a pull request
- At milestone boundaries
- When you want a single pass/fail answer covering both mechanical and qualitative checks
- When `on_pr` or `on_milestone` triggers fire
- NOT after every individual task (use harness-verify for quick gate)
- NOT when you only need code review without mechanical checks (use harness-code-review)

### Relationship to Other Skills

| Skill | Scope | Speed |
|-------|-------|-------|
| harness-verify | Mechanical only (test/lint/types) | Fast (~30s) |
| harness-code-review | AI review only | Medium (~2min) |
| harness-integrity (this skill) | Both mechanical + AI review | Full (~3min) |
| harness-verification | Deep 3-level audit (EXISTS/SUBSTANTIVE/WIRED) | Thorough (~5min) |

This skill combines harness-verify and harness-code-review into a single pipeline with a unified report.

## Process

### Phase 1: VERIFY — Mechanical Quick Gate

Invoke harness-verify to run the mechanical checks:

1. Execute harness-verify against the project root
2. Capture the structured result (Tests/Lint/Types — each PASS/FAIL/SKIPPED)
3. If all mechanical checks fail, stop here — no point in AI review when the code does not compile or tests fail
4. If at least one mechanical check passes, proceed to Phase 2

### Phase 2: REVIEW — Change-Type-Aware AI Review

Invoke harness-code-review with change-type awareness:

1. **Detect change type** from commit message prefix or accept as argument:
   - `feat:` → feature
   - `fix:` → bugfix
   - `refactor:` → refactor
   - `docs:` → docs
   - Default: feature (if undetected)

2. **Run review** with the appropriate checklist:
   - **Feature:** spec alignment, edge cases, test coverage, API surface, backward compatibility
   - **Bugfix:** root cause identified, regression test added, no collateral changes
   - **Refactor:** behavioral equivalence, no functionality changes, tests unchanged
   - **Docs:** accuracy vs. current code, completeness, consistency

3. **Classify findings:**
   - **Blocking:** must be fixed before merge (security issues, logic errors, missing tests for new behavior)
   - **Suggestion:** recommended improvements (style, naming, minor refactoring)

### Phase 3: REPORT — Unified Integrity Report

Produce the report in this exact format:

```
Integrity Check: [PASS/FAIL]
- Tests: [PASS/FAIL/SKIPPED] ([summary])
- Lint: [PASS/FAIL/SKIPPED] ([summary])
- Types: [PASS/FAIL/SKIPPED] ([summary])
- Review: [N findings] ([M blocking])
```

**Overall verdict:**
- PASS: all mechanical checks pass AND zero blocking review findings
- FAIL: any mechanical check fails OR any blocking review finding exists

If the verdict is FAIL, list all failures and blocking findings below the summary with specific file paths and line numbers.

## Deterministic Checks

Phase 1 (verify) is entirely deterministic — see harness-verify.

Phase 2 (review) involves LLM judgment. The deterministic-first principle applies: run all mechanical checks before invoking AI review. Do not ask the AI to find bugs that a type checker would catch.

## Success Criteria

- Mechanical verification ran and produced structured results
- AI review ran with change-type awareness
- Unified report follows the exact format
- Overall verdict correctly reflects both mechanical and review results
- Blocking findings are clearly separated from suggestions

## Gates

- **Mechanical checks first.** Never run AI review without running mechanical checks first. The deterministic-first principle is non-negotiable.
- **No partial reports.** Either run the full pipeline or report why a phase was skipped. Do not produce a report missing phases without explanation.
- **Fresh execution only.** All checks must be run in the current session. No cached results.

## Escalation

- **When mechanical checks all fail:** Stop after Phase 1. Report the failures. Do not waste time on AI review of code that does not compile.
- **When AI review finds architectural concerns:** Note in the report but do not block. Architectural concerns should be escalated to a human architect, not blocked by a gate.
- **When you need deeper verification:** Use harness-verification (deep audit) for milestone-level evidence-based verification.
```

- [ ] **Step 2: Run `harness validate`**
- [ ] **Step 3: Commit** — `feat(skills): add harness-integrity SKILL.md — unified integrity gate (completes deferred A6)`

---

## Chunk 3: E2 — EARS Requirement Syntax in Planning

Add EARS (Easy Approach to Requirements Syntax) template section to harness-planning SKILL.md. This gives planners structured sentence patterns for writing unambiguous requirements.

### Task 5: Add EARS section to harness-planning SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-planning/SKILL.md`

- [ ] **Step 1: Add EARS section after the "Phase 1: SCOPE" section**

In `agents/skills/claude-code/harness-planning/SKILL.md`, insert the following after the Phase 1 SCOPE section (after the line `5. **Apply YAGNI.** For every artifact, ask: "Is this required for an observable truth?" If not, cut it.`) and before the `---` that precedes Phase 2:

```markdown

#### EARS Requirement Patterns

When writing observable truths and acceptance criteria, use EARS (Easy Approach to Requirements Syntax) sentence patterns. These patterns eliminate ambiguity by forcing a consistent grammatical structure.

| Pattern | Template | Use When |
|---------|----------|----------|
| **Ubiquitous** | The system shall [behavior]. | Behavior that always applies, unconditionally |
| **Event-driven** | When [trigger], the system shall [response]. | Behavior triggered by a specific event |
| **State-driven** | While [state], the system shall [behavior]. | Behavior that applies only during a certain state |
| **Optional** | Where [feature is enabled], the system shall [behavior]. | Behavior gated by a configuration or feature flag |
| **Unwanted** | If [condition], then the system shall not [behavior]. | Explicitly preventing undesirable behavior |

**Worked Examples:**

1. **Ubiquitous:** "The system shall return JSON responses with `Content-Type: application/json` header."
2. **Event-driven:** "When a user submits an invalid form, the system shall display field-level error messages within 200ms."
3. **State-driven:** "While the database connection is unavailable, the system shall serve cached responses and log reconnection attempts."
4. **Optional:** "Where rate limiting is enabled, the system shall reject requests exceeding 100/minute per API key with HTTP 429."
5. **Unwanted:** "If the request body exceeds 10MB, then the system shall not attempt to parse it — return HTTP 413 immediately."

**When to use EARS:** Apply these patterns when writing observable truths in Phase 1. Not every criterion needs an EARS pattern — use them when the requirement is behavioral (not structural). File existence checks ("src/types/user.ts exists with User interface") do not need EARS framing.
```

- [ ] **Step 2: Run `harness validate`**
- [ ] **Step 3: Commit** — `feat(skills): add EARS requirement syntax patterns to harness-planning`

### Task 6: Add EARS reference to harness-brainstorming SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-brainstorming/SKILL.md`

- [ ] **Step 1: Read the current brainstorming SKILL.md**

Read `agents/skills/claude-code/harness-brainstorming/SKILL.md` to find the appropriate location for a brief EARS reference.

- [ ] **Step 2: Add a brief EARS note**

Add the following note to the brainstorming skill in the section that covers output or handoff to planning. The exact location depends on the current structure — add it where requirements or acceptance criteria are discussed:

```markdown

#### Requirement Phrasing

When brainstorming produces requirements or acceptance criteria that will feed into planning, prefer EARS sentence patterns for behavioral requirements. See the EARS Requirement Patterns section in harness-planning for the full template reference. Key patterns:

- **Event-driven:** "When [trigger], the system shall [response]."
- **Unwanted:** "If [condition], then the system shall not [behavior]."

These patterns make requirements testable and unambiguous. Apply them when the output of brainstorming includes specific behavioral expectations.
```

- [ ] **Step 3: Run `harness validate`**
- [ ] **Step 4: Commit** — `feat(skills): add EARS reference to harness-brainstorming`

---

## Chunk 4: E3 — Phase Gates CLI Command

New `harness check-phase-gate` command. Validates that implementation files have corresponding specs. TDD approach.

### Task 7: Add phase-gates config to HarnessConfigSchema

**Files:**
- Modify: `packages/cli/src/config/schema.ts`
- Test: `packages/cli/tests/config/schema.test.ts` (if exists, otherwise inline validation)

- [ ] **Step 1: Add PhaseGateConfig schema**

In `packages/cli/src/config/schema.ts`, add the following before the `HarnessConfigSchema` definition:

```typescript
export const PhaseGateConfigSchema = z.object({
  enabled: z.boolean().default(false),
  severity: z.enum(['warning', 'error']).default('warning'),
  mappings: z.array(z.object({
    implPattern: z.string(),
    specPattern: z.string(),
  })).default([
    { implPattern: 'src/**/*.ts', specPattern: 'docs/specs/**/*.md' },
  ]),
});
```

Then add the field to `HarnessConfigSchema`:

```typescript
  phaseGates: PhaseGateConfigSchema.optional(),
```

- [ ] **Step 2: Run `pnpm --filter @harness-engineering/cli build`** to verify compilation
- [ ] **Step 3: Commit** — `feat(cli): add phase-gates config schema`

### Task 8: Write failing test for check-phase-gate command

**Files:**
- Create: `packages/cli/tests/commands/check-phase-gate.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/commands/check-phase-gate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createCheckPhaseGateCommand, runCheckPhaseGate } from '../../src/commands/check-phase-gate';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('check-phase-gate command', () => {
  describe('createCheckPhaseGateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckPhaseGateCommand();
      expect(cmd.name()).toBe('check-phase-gate');
    });

    it('has a description', () => {
      const cmd = createCheckPhaseGateCommand();
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('runCheckPhaseGate', () => {
    let tmpDir: string;

    function setupProject(files: Record<string, string>): string {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-phase-gate-'));
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tmpDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
      }
      return tmpDir;
    }

    it('returns pass when phase gates are disabled', async () => {
      const projectDir = setupProject({
        'harness.config.json': JSON.stringify({ version: 1 }),
        'src/foo.ts': 'export const foo = 1;',
      });

      const result = await runCheckPhaseGate({ cwd: projectDir });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.skipped).toBe(true);
      }
    });

    it('returns pass when all impl files have matching specs', async () => {
      const projectDir = setupProject({
        'harness.config.json': JSON.stringify({
          version: 1,
          phaseGates: {
            enabled: true,
            mappings: [
              { implPattern: 'src/**/*.ts', specPattern: 'docs/specs/**/*.md' },
            ],
          },
        }),
        'src/auth/login.ts': 'export function login() {}',
        'docs/specs/auth.md': '# Auth Spec',
        'AGENTS.md': '# Agents',
      });

      const result = await runCheckPhaseGate({
        cwd: projectDir,
        specResolver: (implFile: string) => {
          // Simple resolver: src/auth/login.ts -> docs/specs/auth.md
          const parts = implFile.split(path.sep);
          const feature = parts[1]; // 'auth' from 'src/auth/login.ts'
          return `docs/specs/${feature}.md`;
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.missingSpecs).toHaveLength(0);
      }
    });

    it('returns fail when impl files are missing specs', async () => {
      const projectDir = setupProject({
        'harness.config.json': JSON.stringify({
          version: 1,
          phaseGates: {
            enabled: true,
            mappings: [
              { implPattern: 'src/**/*.ts', specPattern: 'docs/specs/**/*.md' },
            ],
          },
        }),
        'src/payments/charge.ts': 'export function charge() {}',
        'AGENTS.md': '# Agents',
      });

      const result = await runCheckPhaseGate({ cwd: projectDir });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.missingSpecs.length).toBeGreaterThan(0);
        expect(result.value.missingSpecs[0].implFile).toContain('charge.ts');
      }
    });

    it('respects severity setting', async () => {
      const projectDir = setupProject({
        'harness.config.json': JSON.stringify({
          version: 1,
          phaseGates: {
            enabled: true,
            severity: 'error',
            mappings: [
              { implPattern: 'src/**/*.ts', specPattern: 'docs/specs/**/*.md' },
            ],
          },
        }),
        'src/foo.ts': 'export const foo = 1;',
        'AGENTS.md': '# Agents',
      });

      const result = await runCheckPhaseGate({ cwd: projectDir });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.severity).toBe('error');
      }
    });
  });
});
```

- [ ] **Step 2: Run test — observe failure**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli test -- packages/cli/tests/commands/check-phase-gate.test.ts
```

Expect: module not found error for `../../src/commands/check-phase-gate`.

- [ ] **Step 3: Commit** — `test(cli): add failing tests for check-phase-gate command`

### Task 9: Implement check-phase-gate command

**Files:**
- Create: `packages/cli/src/commands/check-phase-gate.ts`

- [ ] **Step 1: Create the command implementation**

Create `packages/cli/src/commands/check-phase-gate.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { findFiles } from '../utils/files';

interface MissingSpec {
  implFile: string;
  expectedSpec: string;
}

interface CheckPhaseGateResult {
  pass: boolean;
  skipped: boolean;
  severity: 'warning' | 'error';
  missingSpecs: MissingSpec[];
  checkedFiles: number;
}

type SpecResolver = (implFile: string) => string;

interface CheckPhaseGateOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  specResolver?: SpecResolver;
}

/**
 * Default spec resolver: maps src/<feature>/file.ts to docs/specs/<feature>.md
 * Extracts the first directory segment after the impl root as the feature name.
 */
function defaultSpecResolver(implFile: string, implPattern: string): string {
  // Extract the base directory from the pattern (e.g., 'src' from 'src/**/*.ts')
  const implRoot = implPattern.split('/')[0];
  const relative = implFile.startsWith(implRoot + path.sep)
    ? implFile.slice(implRoot.length + 1)
    : implFile;

  // Use the first path segment as the feature name
  const segments = relative.split(path.sep);
  const feature = segments.length > 1 ? segments[0] : path.basename(segments[0], path.extname(segments[0]));

  return `docs/specs/${feature}.md`;
}

export async function runCheckPhaseGate(
  options: CheckPhaseGateOptions
): Promise<Result<CheckPhaseGateResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  // Try to load config — phase gates config is optional
  let phaseGatesConfig: {
    enabled: boolean;
    severity: 'warning' | 'error';
    mappings: Array<{ implPattern: string; specPattern: string }>;
  } | undefined;

  const configPath = options.configPath ?? path.join(cwd, 'harness.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      phaseGatesConfig = raw.phaseGates;
    } catch {
      // Config parse failure is non-fatal for phase gates
    }
  }

  // If phase gates not configured or not enabled, skip
  if (!phaseGatesConfig || !phaseGatesConfig.enabled) {
    return Ok({
      pass: true,
      skipped: true,
      severity: 'warning',
      missingSpecs: [],
      checkedFiles: 0,
    });
  }

  const severity = phaseGatesConfig.severity ?? 'warning';
  const mappings = phaseGatesConfig.mappings ?? [
    { implPattern: 'src/**/*.ts', specPattern: 'docs/specs/**/*.md' },
  ];

  const missingSpecs: MissingSpec[] = [];
  let checkedFiles = 0;

  for (const mapping of mappings) {
    // Find all implementation files matching the pattern
    const implFiles = await findFiles(mapping.implPattern, cwd);

    for (const implFile of implFiles) {
      checkedFiles++;

      // Resolve the expected spec path
      const expectedSpec = options.specResolver
        ? options.specResolver(implFile)
        : defaultSpecResolver(implFile, mapping.implPattern);

      const specFullPath = path.resolve(cwd, expectedSpec);

      if (!fs.existsSync(specFullPath)) {
        missingSpecs.push({
          implFile,
          expectedSpec,
        });
      }
    }
  }

  return Ok({
    pass: missingSpecs.length === 0,
    skipped: false,
    severity,
    missingSpecs,
    checkedFiles,
  });
}

export function createCheckPhaseGateCommand(): Command {
  const command = new Command('check-phase-gate')
    .description('Validate that implementation files have corresponding spec documents')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runCheckPhaseGate({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      const value = result.value;

      if (value.skipped) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ skipped: true, message: 'Phase gates not enabled' }));
        } else if (mode !== OutputMode.QUIET) {
          console.log('Phase gates not enabled (set phaseGates.enabled: true in harness.config.json)');
        }
        process.exit(ExitCode.SUCCESS);
      }

      const issues = value.missingSpecs.map((m) => ({
        file: m.implFile,
        message: `Missing spec: ${m.expectedSpec}`,
      }));

      const output = formatter.formatValidation({
        valid: value.pass,
        issues,
      });

      if (output) {
        console.log(output);
      }

      if (!value.pass && value.severity === 'error') {
        process.exit(ExitCode.VALIDATION_FAILED);
      } else {
        process.exit(ExitCode.SUCCESS);
      }
    });

  return command;
}
```

- [ ] **Step 2: Run tests — observe pass**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli test -- packages/cli/tests/commands/check-phase-gate.test.ts
```

- [ ] **Step 3: Commit** — `feat(cli): implement check-phase-gate command`

### Task 10: Register check-phase-gate command in CLI

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add import and registration**

In `packages/cli/src/index.ts`, add the import:

```typescript
import { createCheckPhaseGateCommand } from './commands/check-phase-gate';
```

Add after the existing `createCheckDocsCommand()` registration:

```typescript
  program.addCommand(createCheckPhaseGateCommand());
```

- [ ] **Step 2: Run `pnpm --filter @harness-engineering/cli build`** to verify compilation
- [ ] **Step 3: Run all CLI tests to ensure no regressions**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli test
```

- [ ] **Step 4: Commit** — `feat(cli): register check-phase-gate command`

---

## Chunk 5: E4 — Workflow Orchestration Types and Runner

Add workflow types to `packages/types/` and a workflow runner to `packages/core/`. TDD approach with full test coverage.

### Task 11: Add workflow types to packages/types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add workflow type definitions**

In `packages/types/src/index.ts`, add the following after the existing `Placeholder` type (replace `export type Placeholder = never;`):

```typescript
// Workflow orchestration types

/**
 * A single step in a workflow pipeline.
 */
export interface WorkflowStep {
  /** Skill name to invoke for this step */
  skill: string;
  /** Artifact type this step produces */
  produces: string;
  /** Artifact type this step expects from the previous step (undefined for first step) */
  expects?: string;
  /** Gate behavior: 'pass-required' stops the pipeline on failure, 'advisory' logs and continues */
  gate?: 'pass-required' | 'advisory';
}

/**
 * A named sequence of workflow steps forming a skill pipeline.
 */
export interface Workflow {
  /** Unique name for this workflow */
  name: string;
  /** Ordered list of steps to execute */
  steps: WorkflowStep[];
}

/**
 * Outcome of a single workflow step execution.
 */
export type StepOutcome = 'pass' | 'fail' | 'skipped';

/**
 * Result of executing a single workflow step.
 */
export interface WorkflowStepResult {
  /** The step that was executed */
  step: WorkflowStep;
  /** Whether the step passed, failed, or was skipped */
  outcome: StepOutcome;
  /** Artifact produced by this step (if any) */
  artifact?: string;
  /** Error message if the step failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Result of executing an entire workflow.
 */
export interface WorkflowResult {
  /** The workflow that was executed */
  workflow: Workflow;
  /** Per-step results in execution order */
  stepResults: WorkflowStepResult[];
  /** Overall pass/fail */
  pass: boolean;
  /** Total duration in milliseconds */
  totalDurationMs: number;
}
```

- [ ] **Step 2: Run `pnpm --filter @harness-engineering/types build`** to verify compilation
- [ ] **Step 3: Commit** — `feat(types): add workflow orchestration types`

### Task 12: Write failing tests for workflow runner

**Files:**
- Create: `packages/core/tests/workflow/runner.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/core/tests/workflow/runner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type {
  Workflow,
  WorkflowStep,
  WorkflowResult,
  WorkflowStepResult,
} from '@harness-engineering/types';

// Will import from implementation once created
// import { executeWorkflow, type StepExecutor } from '../../src/workflow/runner';

describe('workflow runner', () => {
  // Placeholder — tests will use dynamic import to handle module-not-found gracefully
  let executeWorkflow: any;
  let StepExecutorType: any;

  beforeAll(async () => {
    try {
      const mod = await import('../../src/workflow/runner');
      executeWorkflow = mod.executeWorkflow;
    } catch {
      // Module doesn't exist yet — tests will fail as expected
    }
  });

  const makeStep = (overrides: Partial<WorkflowStep> = {}): WorkflowStep => ({
    skill: 'test-skill',
    produces: 'test-artifact',
    ...overrides,
  });

  const passingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => ({
    step,
    outcome: 'pass',
    artifact: `${step.produces}-output`,
    durationMs: 10,
  });

  const failingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => ({
    step,
    outcome: 'fail',
    error: 'Step failed',
    durationMs: 10,
  });

  describe('executeWorkflow', () => {
    it('executes all steps in sequence and returns pass', async () => {
      const workflow: Workflow = {
        name: 'test-workflow',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
          makeStep({ skill: 'verify', produces: 'report', expects: 'code' }),
        ],
      };

      const result = await executeWorkflow(workflow, passingExecutor);

      expect(result.pass).toBe(true);
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults[0].outcome).toBe('pass');
      expect(result.stepResults[1].outcome).toBe('pass');
      expect(result.stepResults[2].outcome).toBe('pass');
      expect(result.workflow).toBe(workflow);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('stops on pass-required gate failure', async () => {
      const workflow: Workflow = {
        name: 'gated-workflow',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc', gate: 'pass-required' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
        ],
      };

      const result = await executeWorkflow(workflow, failingExecutor);

      expect(result.pass).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].outcome).toBe('fail');
      expect(result.stepResults[1].outcome).toBe('skipped');
    });

    it('continues past advisory gate failure', async () => {
      const callLog: string[] = [];
      const loggingExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => {
        callLog.push(step.skill);
        if (step.skill === 'lint') {
          return { step, outcome: 'fail', error: 'Lint warnings', durationMs: 10 };
        }
        return { step, outcome: 'pass', artifact: step.produces, durationMs: 10 };
      };

      const workflow: Workflow = {
        name: 'advisory-workflow',
        steps: [
          makeStep({ skill: 'implement', produces: 'code' }),
          makeStep({ skill: 'lint', produces: 'lint-report', expects: 'code', gate: 'advisory' }),
          makeStep({ skill: 'test', produces: 'test-report', expects: 'code' }),
        ],
      };

      const result = await executeWorkflow(workflow, loggingExecutor);

      expect(callLog).toEqual(['implement', 'lint', 'test']);
      expect(result.pass).toBe(false); // overall still fails because a step failed
      expect(result.stepResults[1].outcome).toBe('fail');
      expect(result.stepResults[2].outcome).toBe('pass'); // continued past advisory failure
    });

    it('handles empty workflow', async () => {
      const workflow: Workflow = { name: 'empty', steps: [] };
      const result = await executeWorkflow(workflow, passingExecutor);

      expect(result.pass).toBe(true);
      expect(result.stepResults).toHaveLength(0);
    });

    it('passes previous artifact to executor', async () => {
      const receivedArtifacts: (string | undefined)[] = [];
      const trackingExecutor = async (
        step: WorkflowStep,
        previousArtifact?: string
      ): Promise<WorkflowStepResult> => {
        receivedArtifacts.push(previousArtifact);
        return { step, outcome: 'pass', artifact: `${step.produces}-out`, durationMs: 10 };
      };

      const workflow: Workflow = {
        name: 'artifact-chain',
        steps: [
          makeStep({ skill: 'plan', produces: 'plan-doc' }),
          makeStep({ skill: 'implement', produces: 'code', expects: 'plan-doc' }),
          makeStep({ skill: 'verify', produces: 'report', expects: 'code' }),
        ],
      };

      await executeWorkflow(workflow, trackingExecutor);

      expect(receivedArtifacts).toEqual([undefined, 'plan-doc-out', 'code-out']);
    });

    it('records total duration', async () => {
      const slowExecutor = async (step: WorkflowStep): Promise<WorkflowStepResult> => {
        return { step, outcome: 'pass', artifact: step.produces, durationMs: 50 };
      };

      const workflow: Workflow = {
        name: 'timed',
        steps: [makeStep({ skill: 'a', produces: 'x' })],
      };

      const result = await executeWorkflow(workflow, slowExecutor);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
```

- [ ] **Step 2: Run test — observe failure**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/core test -- packages/core/tests/workflow/runner.test.ts
```

Expect: import failure or `executeWorkflow` is undefined.

- [ ] **Step 3: Commit** — `test(core): add failing tests for workflow runner`

### Task 13: Implement workflow runner

**Files:**
- Create: `packages/core/src/workflow/runner.ts`
- Create: `packages/core/src/workflow/index.ts`

- [ ] **Step 1: Create runner implementation**

Create `packages/core/src/workflow/runner.ts`:

```typescript
import type {
  Workflow,
  WorkflowStep,
  WorkflowResult,
  WorkflowStepResult,
} from '@harness-engineering/types';

/**
 * Function that executes a single workflow step.
 * Receives the step definition and optionally the artifact from the previous step.
 * Returns the step result including outcome and any produced artifact.
 */
export type StepExecutor = (
  step: WorkflowStep,
  previousArtifact?: string
) => Promise<WorkflowStepResult>;

/**
 * Executes a workflow by running each step in sequence.
 *
 * Behavior:
 * - Steps run in order, each receiving the artifact from the previous step
 * - If a step with gate='pass-required' fails, remaining steps are skipped
 * - If a step with gate='advisory' fails, execution continues
 * - Steps with no gate behave like 'pass-required' (default: stop on failure)
 * - Overall pass = all executed steps passed
 */
export async function executeWorkflow(
  workflow: Workflow,
  executor: StepExecutor
): Promise<WorkflowResult> {
  const stepResults: WorkflowStepResult[] = [];
  const startTime = Date.now();
  let previousArtifact: string | undefined;
  let stopped = false;

  for (const step of workflow.steps) {
    if (stopped) {
      stepResults.push({
        step,
        outcome: 'skipped',
        durationMs: 0,
      });
      continue;
    }

    const stepResult = await executor(step, previousArtifact);
    stepResults.push(stepResult);

    if (stepResult.outcome === 'pass') {
      previousArtifact = stepResult.artifact;
    } else {
      // Step failed — check gate behavior
      const gate = step.gate ?? 'pass-required';
      if (gate === 'pass-required') {
        stopped = true;
      }
      // For advisory gates, continue execution but don't update previousArtifact
    }
  }

  const allPassed = stepResults.every(
    (r) => r.outcome === 'pass' || r.outcome === 'skipped'
  );
  // A workflow with all skipped steps (except due to gate failure) is still a pass
  // But if steps were skipped due to a gate failure, it's a fail
  const hasFailure = stepResults.some((r) => r.outcome === 'fail');

  return {
    workflow,
    stepResults,
    pass: !hasFailure,
    totalDurationMs: Date.now() - startTime,
  };
}
```

- [ ] **Step 2: Create index.ts barrel export**

Create `packages/core/src/workflow/index.ts`:

```typescript
export { executeWorkflow, type StepExecutor } from './runner';
```

- [ ] **Step 3: Export workflow module from core index**

In `packages/core/src/index.ts`, add before the `// Package version` line:

```typescript
// Workflow module
export * from './workflow';
```

- [ ] **Step 4: Update test imports**

In `packages/core/tests/workflow/runner.test.ts`, replace the dynamic import block at the top of the describe with a direct import. Replace:

```typescript
  // Placeholder — tests will use dynamic import to handle module-not-found gracefully
  let executeWorkflow: any;
  let StepExecutorType: any;

  beforeAll(async () => {
    try {
      const mod = await import('../../src/workflow/runner');
      executeWorkflow = mod.executeWorkflow;
    } catch {
      // Module doesn't exist yet — tests will fail as expected
    }
  });
```

With a top-level import at the top of the file (after the vitest import):

```typescript
import { executeWorkflow } from '../../src/workflow/runner';
```

And remove the `let` declarations and `beforeAll` block from inside the describe.

- [ ] **Step 5: Run tests — observe pass**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/core test -- packages/core/tests/workflow/runner.test.ts
```

- [ ] **Step 6: Run full core test suite to ensure no regressions**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/core test
```

- [ ] **Step 7: Commit** — `feat(core): implement workflow runner with step execution and gate support`

---

## Chunk 6: Final Validation

### Task 14: Full build and test verification

- [ ] **Step 1: Build all packages**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm build
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm test
```

- [ ] **Step 3: Run harness validate**

```bash
cd /Users/cwarner/Projects/harness-engineering && pnpm harness validate
```

- [ ] **Step 4: Verify all new files exist**

Confirm the following files were created:
- `agents/skills/claude-code/harness-verify/skill.yaml`
- `agents/skills/claude-code/harness-verify/SKILL.md`
- `agents/skills/claude-code/harness-integrity/skill.yaml`
- `agents/skills/claude-code/harness-integrity/SKILL.md`
- `packages/cli/src/commands/check-phase-gate.ts`
- `packages/cli/tests/commands/check-phase-gate.test.ts`
- `packages/core/src/workflow/runner.ts`
- `packages/core/src/workflow/index.ts`
- `packages/core/tests/workflow/runner.test.ts`

And the following files were modified:
- `agents/skills/claude-code/harness-planning/SKILL.md` (EARS section)
- `agents/skills/claude-code/harness-brainstorming/SKILL.md` (EARS reference)
- `packages/types/src/index.ts` (workflow types)
- `packages/cli/src/config/schema.ts` (phase gate config)
- `packages/cli/src/index.ts` (command registration)
- `packages/core/src/index.ts` (workflow export)

- [ ] **Step 5: Commit** — (only if any fixups were needed) `fix: resolve build/test issues from Group E implementation`
