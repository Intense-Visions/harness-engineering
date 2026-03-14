# Framework-Inspired Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scale-adaptive rigor, project principles, cross-artifact validation, workflow re-entry, and multi-perspective brainstorming to the harness engineering toolkit.

**Architecture:** All 5 enhancements touch the `harness skill run` command's preamble injection system. Enhancements 1-2-4 share CLI/MCP changes. Enhancement 3 is a standalone validate module. Enhancement 5 is SKILL.md content only.

**Tech Stack:** TypeScript, Zod, Commander.js, Vitest

**Spec:** [2026-03-14-framework-inspired-enhancements-design.md](../specs/2026-03-14-framework-inspired-enhancements-design.md)

---

## File Structure

### Schema changes
```
packages/cli/src/skill/schema.ts           # Add required field to SkillPhaseSchema
agents/skills/tests/schema.ts              # Same change (duplicate schema)
```

### Preamble injection system (shared by enhancements 1, 2, 4)
```
packages/cli/src/commands/skill/preamble.ts  # NEW: builds preamble from context
packages/cli/src/commands/skill/run.ts       # MODIFY: use preamble builder, add --complexity/--phase/--party flags
```

### Auto-detection
```
packages/cli/src/skill/complexity.ts         # NEW: auto-detect complexity from git
```

### Cross-artifact validation
```
packages/cli/src/commands/validate-cross-check.ts  # NEW: spec→plan→impl consistency
packages/cli/src/commands/validate.ts               # MODIFY: add --cross-check flag
```

### MCP changes
```
packages/mcp-server/src/tools/skill.ts       # MODIFY: add complexity/phase/party inputs
```

### Skill content changes
```
agents/skills/claude-code/harness-debugging/skill.yaml     # MODIFY: fix phase names
agents/skills/claude-code/harness-brainstorming/SKILL.md   # MODIFY: add party mode process
agents/skills/claude-code/*/skill.yaml                     # MODIFY: add required field to phases
```

### Template changes
```
templates/intermediate/docs/principles.md.hbs  # NEW: starter principles file
templates/advanced/docs/principles.md.hbs      # NEW: starter principles file
```

### Tests
```
packages/cli/tests/skill/complexity.test.ts           # NEW
packages/cli/tests/skill/preamble.test.ts             # NEW
packages/cli/tests/commands/validate-cross-check.test.ts  # NEW
```

---

## Chunk 1: Schema + Preamble + Complexity

### Task 1: Add `required` field to SkillPhaseSchema

**Files:**
- Modify: `packages/cli/src/skill/schema.ts`
- Modify: `agents/skills/tests/schema.ts`
- Modify: `agents/skills/tests/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `agents/skills/tests/schema.test.ts`:

```typescript
it('validates phase with required field', () => {
  const withPhases = {
    ...validSkill,
    phases: [
      { name: 'red', description: 'Write failing test', required: true },
      { name: 'refactor', description: 'Clean up', required: false },
    ],
  };
  const result = SkillMetadataSchema.safeParse(withPhases);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.phases![0].required).toBe(true);
    expect(result.data.phases![1].required).toBe(false);
  }
});

it('defaults required to true for phases', () => {
  const withPhases = {
    ...validSkill,
    phases: [{ name: 'red', description: 'Write failing test' }],
  };
  const result = SkillMetadataSchema.parse(withPhases);
  expect(result.phases![0].required).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/skills && npx vitest run tests/schema.test.ts`

- [ ] **Step 3: Update both schema files**

In both `packages/cli/src/skill/schema.ts` and `agents/skills/tests/schema.ts`, change:

```typescript
const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
});
```

To:

```typescript
const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
});
```

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/skill/schema.ts agents/skills/tests/schema.ts agents/skills/tests/schema.test.ts
git commit -m "feat(skills): add required field to SkillPhaseSchema for scale-adaptive rigor"
```

---

### Task 2: Complexity Auto-Detection

**Files:**
- Create: `packages/cli/src/skill/complexity.ts`
- Test: `packages/cli/tests/skill/complexity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/skill/complexity.test.ts
import { describe, it, expect } from 'vitest';
import { detectComplexity } from '../../src/skill/complexity';

describe('detectComplexity', () => {
  it('returns full as default when no git context', () => {
    // Non-git directory
    const result = detectComplexity('/tmp/not-a-repo');
    expect(result).toBe('full');
  });

  it('returns light|full based on signal detection', () => {
    // Since we can't easily mock git, test the signal evaluation logic directly
    const { evaluateSignals } = require('../../src/skill/complexity');

    expect(evaluateSignals({ fileCount: 1, testOnly: false, docsOnly: false, newDir: false, newDep: false })).toBe('light');
    expect(evaluateSignals({ fileCount: 5, testOnly: false, docsOnly: false, newDir: false, newDep: false })).toBe('full');
    expect(evaluateSignals({ fileCount: 1, testOnly: true, docsOnly: false, newDir: false, newDep: false })).toBe('light');
    expect(evaluateSignals({ fileCount: 1, testOnly: false, docsOnly: false, newDir: true, newDep: false })).toBe('full');
    expect(evaluateSignals({ fileCount: 1, testOnly: false, docsOnly: false, newDir: false, newDep: true })).toBe('full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write implementation**

```typescript
// packages/cli/src/skill/complexity.ts
import { execSync } from 'child_process';

export type Complexity = 'light' | 'full' | 'auto';

interface Signals {
  fileCount: number;
  testOnly: boolean;
  docsOnly: boolean;
  newDir: boolean;
  newDep: boolean;
}

export function evaluateSignals(signals: Signals): 'light' | 'full' {
  // Full if any "full" signal is present
  if (signals.fileCount >= 3) return 'full';
  if (signals.newDir) return 'full';
  if (signals.newDep) return 'full';

  // Light if single file or test/docs only
  if (signals.fileCount <= 1) return 'light';
  if (signals.testOnly) return 'light';
  if (signals.docsOnly) return 'light';

  return 'full';
}

export function detectComplexity(projectPath: string): 'light' | 'full' {
  try {
    // Find base commit
    const base = execSync('git merge-base HEAD main', {
      cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const diffFiles = execSync(`git diff --name-only ${base}`, {
      cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean);

    const diffStat = execSync(`git diff --stat ${base}`, {
      cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const signals: Signals = {
      fileCount: diffFiles.length,
      testOnly: diffFiles.every(f => f.match(/\.(test|spec)\./)),
      docsOnly: diffFiles.every(f => f.startsWith('docs/') || f.endsWith('.md')),
      newDir: diffStat.includes('create mode') || diffFiles.some(f => {
        const parts = f.split('/');
        return parts.length > 1; // Rough heuristic
      }),
      newDep: diffFiles.some(f => ['package.json', 'Cargo.toml', 'go.mod', 'requirements.txt'].includes(f)),
    };

    return evaluateSignals(signals);
  } catch {
    // No git context → default to full
    return 'full';
  }
}
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/skill/complexity.ts packages/cli/tests/skill/complexity.test.ts
git commit -m "feat(skills): add complexity auto-detection from git diff signals"
```

---

### Task 3: Preamble Builder + Upgraded `skill run`

**Files:**
- Create: `packages/cli/src/commands/skill/preamble.ts`
- Modify: `packages/cli/src/commands/skill/run.ts`
- Test: `packages/cli/tests/skill/preamble.test.ts`

- [ ] **Step 1: Write the preamble test**

```typescript
// packages/cli/tests/skill/preamble.test.ts
import { describe, it, expect } from 'vitest';
import { buildPreamble } from '../../src/commands/skill/preamble';

describe('buildPreamble', () => {
  it('includes complexity section when phases exist', () => {
    const preamble = buildPreamble({
      complexity: 'light',
      phases: [
        { name: 'red', description: 'Write test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    });
    expect(preamble).toContain('## Active Phases');
    expect(preamble).toContain('RED (required)');
    expect(preamble).toContain('~~REFACTOR~~ (skipped in light mode)');
  });

  it('shows all phases in full mode', () => {
    const preamble = buildPreamble({
      complexity: 'full',
      phases: [
        { name: 'red', description: 'Write test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    });
    expect(preamble).toContain('REFACTOR');
    expect(preamble).not.toContain('~~REFACTOR~~');
  });

  it('includes principles when provided', () => {
    const preamble = buildPreamble({
      principles: '## Code Quality\n- Explicit over implicit',
    });
    expect(preamble).toContain('## Project Principles');
    expect(preamble).toContain('Explicit over implicit');
  });

  it('includes phase re-entry info', () => {
    const preamble = buildPreamble({
      phase: 'hypothesize',
      priorState: 'Some debug state content',
    });
    expect(preamble).toContain('## Resuming at Phase: hypothesize');
    expect(preamble).toContain('Some debug state content');
  });

  it('includes party mode indicator', () => {
    const preamble = buildPreamble({ party: true });
    expect(preamble).toContain('## Party Mode: Active');
  });

  it('returns empty string when no options set', () => {
    const preamble = buildPreamble({});
    expect(preamble).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write preamble builder**

```typescript
// packages/cli/src/commands/skill/preamble.ts

interface Phase {
  name: string;
  description: string;
  required: boolean;
}

interface PreambleOptions {
  complexity?: 'light' | 'full';
  phases?: Phase[];
  principles?: string;
  phase?: string;           // re-entry phase name
  priorState?: string;      // loaded state content
  stateWarning?: string;    // warning if no state
  party?: boolean;
}

export function buildPreamble(options: PreambleOptions): string {
  const sections: string[] = [];

  // Complexity + active phases
  if (options.complexity && options.phases && options.phases.length > 0) {
    const lines = [`## Active Phases (complexity: ${options.complexity})`];
    for (const phase of options.phases) {
      if (options.complexity === 'light' && !phase.required) {
        lines.push(`- ~~${phase.name.toUpperCase()}~~ (skipped in light mode)`);
      } else {
        lines.push(`- ${phase.name.toUpperCase()} (${phase.required ? 'required' : 'optional'})`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // Principles
  if (options.principles) {
    sections.push(`## Project Principles (from docs/principles.md)\n${options.principles}`);
  }

  // Phase re-entry
  if (options.phase) {
    const lines = [`## Resuming at Phase: ${options.phase}`];
    if (options.priorState) {
      lines.push(`## Prior state loaded\n${options.priorState}`);
    }
    if (options.stateWarning) {
      lines.push(`> ${options.stateWarning}`);
    }
    sections.push(lines.join('\n'));
  }

  // Party mode
  if (options.party) {
    sections.push('## Party Mode: Active\nEvaluate each approach from multiple contextually relevant perspectives before converging on a recommendation.');
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') + '\n\n---\n\n' : '';
}
```

- [ ] **Step 4: Rewrite `run.ts`**

```typescript
// packages/cli/src/commands/skill/run.ts
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { detectComplexity, type Complexity } from '../../skill/complexity';
import { buildPreamble } from './preamble';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a skill (outputs SKILL.md content with context preamble)')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .option('--path <path>', 'Project root path for context injection')
    .option('--complexity <level>', 'Complexity: auto, light, full', 'auto')
    .option('--phase <name>', 'Start at a specific phase (for re-entry)')
    .option('--party', 'Enable multi-perspective evaluation')
    .action(async (name, opts, cmd) => {
      const _globalOpts = cmd.optsWithGlobals();
      const skillsDir = resolveSkillsDir();
      const skillDir = path.join(skillsDir, name);

      if (!fs.existsSync(skillDir)) {
        logger.error(`Skill not found: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      // Load skill metadata
      const yamlPath = path.join(skillDir, 'skill.yaml');
      let metadata: ReturnType<typeof SkillMetadataSchema.parse> | null = null;
      if (fs.existsSync(yamlPath)) {
        try {
          const raw = fs.readFileSync(yamlPath, 'utf-8');
          const parsed = parse(raw);
          const result = SkillMetadataSchema.safeParse(parsed);
          if (result.success) metadata = result.data;
        } catch { /* ignore */ }
      }

      // Resolve complexity
      let complexity: 'light' | 'full' | undefined;
      if (metadata?.phases && metadata.phases.length > 0) {
        const requested = (opts.complexity as Complexity) ?? 'auto';
        if (requested === 'auto') {
          const projectPath = opts.path ? path.resolve(opts.path) : process.cwd();
          complexity = detectComplexity(projectPath);
        } else {
          complexity = requested;
        }
      }

      // Load principles
      let principles: string | undefined;
      const projectPath = opts.path ? path.resolve(opts.path) : process.cwd();
      const principlesPath = path.join(projectPath, 'docs', 'principles.md');
      if (fs.existsSync(principlesPath)) {
        principles = fs.readFileSync(principlesPath, 'utf-8');
      }

      // Handle phase re-entry
      let priorState: string | undefined;
      let stateWarning: string | undefined;
      if (opts.phase) {
        // Validate phase name
        if (metadata?.phases) {
          const validPhases = metadata.phases.map(p => p.name);
          if (!validPhases.includes(opts.phase)) {
            logger.error(`Unknown phase: ${opts.phase}. Valid phases: ${validPhases.join(', ')}`);
            process.exit(ExitCode.ERROR);
            return;
          }
        }

        // Load state if persistent
        if (metadata?.state.persistent && metadata.state.files.length > 0) {
          for (const stateFilePath of metadata.state.files) {
            const fullPath = path.join(projectPath, stateFilePath);
            if (fs.existsSync(fullPath)) {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                // Find most recent file in directory
                const files = fs.readdirSync(fullPath)
                  .map(f => ({ name: f, mtime: fs.statSync(path.join(fullPath, f)).mtimeMs }))
                  .sort((a, b) => b.mtime - a.mtime);
                if (files.length > 0) {
                  priorState = fs.readFileSync(path.join(fullPath, files[0].name), 'utf-8');
                }
              } else {
                priorState = fs.readFileSync(fullPath, 'utf-8');
              }
              break;
            }
          }
          if (!priorState) {
            stateWarning = 'No prior phase data found. Earlier phases have not been completed. Proceed with caution.';
          }
        }
      }

      // Build preamble
      const preamble = buildPreamble({
        complexity,
        phases: metadata?.phases as Array<{ name: string; description: string; required: boolean }>,
        principles,
        phase: opts.phase,
        priorState,
        stateWarning,
        party: opts.party,
      });

      // Load SKILL.md
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        logger.error(`SKILL.md not found for skill: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      let content = fs.readFileSync(skillMdPath, 'utf-8');

      // Inject project state for persistent skills (existing behavior)
      if (metadata?.state.persistent && opts.path) {
        const stateFile = path.join(projectPath, '.harness', 'state.json');
        if (fs.existsSync(stateFile)) {
          const stateContent = fs.readFileSync(stateFile, 'utf-8');
          content += `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
        }
      }

      // Output: preamble + content
      process.stdout.write(preamble + content);
      process.exit(ExitCode.SUCCESS);
    });
}
```

- [ ] **Step 5: Run all CLI tests**

Run: `cd packages/cli && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/skill/preamble.ts packages/cli/src/commands/skill/run.ts packages/cli/tests/skill/preamble.test.ts
git commit -m "feat(cli): add preamble injection system with complexity, principles, phase re-entry, party mode"
```

---

## Chunk 2: Cross-Artifact Validation

### Task 4: Cross-Check Validator Module

**Files:**
- Create: `packages/cli/src/commands/validate-cross-check.ts`
- Modify: `packages/cli/src/commands/validate.ts`
- Test: `packages/cli/tests/commands/validate-cross-check.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/commands/validate-cross-check.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCrossCheck } from '../../src/commands/validate-cross-check';

describe('runCrossCheck', () => {
  it('returns clean result for empty directories', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-check-'));
    const specsDir = path.join(tmpDir, 'docs', 'superpowers', 'specs');
    const plansDir = path.join(tmpDir, 'docs', 'superpowers', 'plans');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.mkdirSync(plansDir, { recursive: true });

    const result = await runCrossCheck({ specsDir, plansDir, projectPath: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toBe(0);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('detects planned-but-not-built files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-check-'));
    const plansDir = path.join(tmpDir, 'docs', 'superpowers', 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'test-plan.md'), [
      '# Test Plan',
      '### Task 1: Test',
      '**Files:**',
      '- Create: `src/nonexistent.ts`',
    ].join('\n'));

    const result = await runCrossCheck({
      specsDir: path.join(tmpDir, 'docs', 'superpowers', 'specs'),
      plansDir,
      projectPath: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toBeGreaterThan(0);
      expect(result.value.planToImpl.some(w => w.includes('nonexistent.ts'))).toBe(true);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write implementation**

```typescript
// packages/cli/src/commands/validate-cross-check.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { CLIError, ExitCode } from '../utils/errors';

interface CrossCheckResult {
  specToPlan: string[];
  planToImpl: string[];
  staleness: string[];
  warnings: number;
}

interface CrossCheckOptions {
  specsDir: string;
  plansDir: string;
  projectPath: string;
}

function findFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).map(f => path.join(dir, f));
}

function extractPlannedFiles(planContent: string): string[] {
  const files: string[] = [];
  const regex = /- (?:Create|Modify):\s*`([^`]+)`/g;
  let match;
  while ((match = regex.exec(planContent)) !== null) {
    files.push(match[1]);
  }
  return files;
}

function getFileModTime(filePath: string, projectPath: string): Date | null {
  try {
    const output = execSync(`git log -1 --format=%aI -- "${filePath}"`, {
      cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output ? new Date(output) : null;
  } catch {
    return null;
  }
}

export async function runCrossCheck(options: CrossCheckOptions): Promise<Result<CrossCheckResult, CLIError>> {
  const result: CrossCheckResult = {
    specToPlan: [],
    planToImpl: [],
    staleness: [],
    warnings: 0,
  };

  const planFiles = findFiles(options.plansDir, '.md');

  // Check 2: Plan → Implementation coverage
  for (const planFile of planFiles) {
    const content = fs.readFileSync(planFile, 'utf-8');
    const plannedFiles = extractPlannedFiles(content);
    const planName = path.basename(planFile);

    for (const file of plannedFiles) {
      const fullPath = path.join(options.projectPath, file);
      if (!fs.existsSync(fullPath)) {
        result.planToImpl.push(`${planName}: planned file not found: ${file}`);
        result.warnings++;
      }
    }

    // Check 4: Staleness
    const planModTime = getFileModTime(planFile, options.projectPath);
    if (planModTime) {
      for (const file of plannedFiles) {
        const fullPath = path.join(options.projectPath, file);
        if (fs.existsSync(fullPath)) {
          const implModTime = getFileModTime(fullPath, options.projectPath);
          if (implModTime && implModTime > planModTime) {
            result.staleness.push(`${planName}: implementation newer than plan (${file})`);
            result.warnings++;
            break; // One staleness warning per plan is enough
          }
        }
      }
    }
  }

  return Ok(result);
}
```

- [ ] **Step 4: Add --cross-check to validate command**

In `packages/cli/src/commands/validate.ts`, add to `createValidateCommand()`:

```typescript
.option('--cross-check', 'Run cross-artifact consistency validation')
```

In the action handler, before `process.exit`, add:

```typescript
if (globalOpts.crossCheck || opts.crossCheck) {
  const { runCrossCheck } = await import('./validate-cross-check');
  const cwd = process.cwd();
  const config = configResult.value;
  const specsDir = path.join(cwd, config.crossCheck?.specsDir ?? 'docs/superpowers/specs');
  const plansDir = path.join(cwd, config.crossCheck?.plansDir ?? 'docs/superpowers/plans');

  const crossResult = await runCrossCheck({ specsDir, plansDir, projectPath: cwd });
  if (crossResult.ok && crossResult.value.warnings > 0) {
    console.log('\nCross-artifact validation:');
    for (const w of crossResult.value.planToImpl) console.log(`  ! ${w}`);
    for (const w of crossResult.value.staleness) console.log(`  ! ${w}`);
    console.log(`\n  ${crossResult.value.warnings} warnings`);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/cli && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/validate-cross-check.ts packages/cli/src/commands/validate.ts packages/cli/tests/commands/validate-cross-check.test.ts
git commit -m "feat(cli): add cross-artifact validation (--cross-check)"
```

---

## Chunk 3: Templates, Skill Content, MCP

### Task 5: Principles Template Files

**Files:**
- Create: `templates/intermediate/docs/principles.md.hbs`
- Create: `templates/advanced/docs/principles.md.hbs`

- [ ] **Step 1: Create the template**

```handlebars
{{!-- templates/intermediate/docs/principles.md.hbs --}}
# {{projectName}} Principles

## Code Quality
- TODO: Define your code quality principles

## Architecture
- TODO: Define your architectural principles

## Testing
- TODO: Define your testing approach

## Design
- TODO: Define your design principles
```

Use the same content for both intermediate and advanced.

- [ ] **Step 2: Commit**

```bash
git add templates/intermediate/docs/principles.md.hbs templates/advanced/docs/principles.md.hbs
git commit -m "feat(templates): add docs/principles.md to intermediate and advanced templates"
```

---

### Task 6: Fix Debugging Skill Phase Names

**Files:**
- Modify: `agents/skills/claude-code/harness-debugging/skill.yaml`

- [ ] **Step 1: Update phase names to match SKILL.md**

Read the current `skill.yaml`, then update the `phases` section to match the SKILL.md headings:

```yaml
phases:
  - name: investigate
    description: Entropy analysis and root cause search
    required: true
  - name: analyze
    description: Pattern matching against codebase
    required: true
  - name: hypothesize
    description: Form and test single hypothesis
    required: false
  - name: fix
    description: TDD-style regression test and fix
    required: true
```

- [ ] **Step 2: Add `required` to all other skills with phases**

Check all `skill.yaml` files that have `phases` declared. Add `required: true` or `required: false` to each phase based on spec guidance. The key skills with phases:
- `harness-tdd`: red (required), green (required), refactor (false), validate (required)
- `harness-brainstorming`: all required
- `harness-planning`: all required
- `harness-execution`: all required
- `harness-verification`: all required
- `harness-code-review`: all required

- [ ] **Step 3: Run skill validation**

Run: `cd agents/skills && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add agents/skills/
git commit -m "fix(skills): update phase names and add required field to all skill phases"
```

---

### Task 7: Party Mode in Brainstorming SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-brainstorming/SKILL.md`

- [ ] **Step 1: Add party mode section to SKILL.md**

Read the current file, then add a new `## Party Mode` section after `## Process`. Content:

```markdown
## Party Mode

When activated with `--party`, add a multi-perspective evaluation step after proposing approaches.

### Perspective Selection

Select 2-3 perspectives based on design topic:

| Topic | Perspectives |
|---|---|
| API / backend | Backend Developer, API Consumer, Operations |
| UI / frontend | Developer, Designer, End User |
| Infrastructure | Architect, SRE, Developer |
| Data model | Backend Developer, Data Consumer, Migration |
| Library / SDK | Library Author, Library Consumer, Maintainer |
| Cross-cutting | Architect, Security, Developer |
| Default | Architect, Developer, User/Consumer |

### Evaluation Process

For each proposed approach, evaluate from each perspective:

```
### Approach N: [name]

**[Perspective 1] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**[Perspective 2] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**[Perspective 3] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**Synthesis:** [Consensus summary. Address raised concerns. Recommend proceed/revise.]
```

Converge on a recommendation that addresses all concerns before presenting the design.
```

- [ ] **Step 2: Commit**

```bash
git add agents/skills/claude-code/harness-brainstorming/SKILL.md
git commit -m "feat(skills): add party mode multi-perspective evaluation to brainstorming"
```

---

### Task 8: MCP run_skill Enhancements

**Files:**
- Modify: `packages/mcp-server/src/tools/skill.ts`
- Modify: `packages/mcp-server/tests/tools/skill.test.ts`

- [ ] **Step 1: Update MCP tool definition**

Add `complexity`, `phase`, and `party` to the input schema:

```typescript
export const runSkillDefinition = {
  name: 'run_skill',
  description: 'Load and return the content of a skill (SKILL.md), optionally with project state context',
  inputSchema: {
    type: 'object' as const,
    properties: {
      skill: { type: 'string', description: 'Skill name (e.g., harness-tdd)' },
      path: { type: 'string', description: 'Path to project root for state context injection' },
      complexity: { type: 'string', enum: ['auto', 'light', 'full'], description: 'Complexity level' },
      phase: { type: 'string', description: 'Start at a specific phase (re-entry)' },
      party: { type: 'boolean', description: 'Enable multi-perspective evaluation' },
    },
    required: ['skill'],
  },
};
```

- [ ] **Step 2: Update handler to use preamble logic**

The MCP handler should mirror the CLI `run.ts` logic: load metadata, detect complexity, load principles, handle phase re-entry, build preamble, prepend to content. Since we can't share the CLI code directly (different packages), implement lightweight versions of the same logic inline, or import from `@harness-engineering/cli` if it exports the preamble builder.

Simplest approach: the preamble builder is pure logic with no side effects — export it from CLI and import in MCP.

Add to `packages/cli/src/index.ts`:
```typescript
export { buildPreamble } from './commands/skill/preamble';
```

- [ ] **Step 3: Update test**

```typescript
it('accepts complexity, phase, and party inputs', () => {
  expect(runSkillDefinition.inputSchema.properties.complexity).toBeDefined();
  expect(runSkillDefinition.inputSchema.properties.phase).toBeDefined();
  expect(runSkillDefinition.inputSchema.properties.party).toBeDefined();
});
```

- [ ] **Step 4: Run MCP tests**

Run: `cd packages/mcp-server && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/skill.ts packages/mcp-server/tests/tools/skill.test.ts packages/cli/src/index.ts
git commit -m "feat(mcp-server): add complexity, phase, party inputs to run_skill tool"
```

---

### Task 9: Final Integration Verification

- [ ] **Step 1: Run all skill tests**

Run: `cd agents/skills && npx vitest run`

- [ ] **Step 2: Run all CLI tests**

Run: `cd packages/cli && npx vitest run`

- [ ] **Step 3: Run all MCP tests**

Run: `cd packages/mcp-server && npx vitest run`

- [ ] **Step 4: Build all packages**

Run: `pnpm --filter @harness-engineering/types --filter @harness-engineering/core --filter @harness-engineering/cli --filter @harness-engineering/eslint-plugin --filter @harness-engineering/linter-gen --filter @harness-engineering/mcp-server run build`

- [ ] **Step 5: Fix any issues and commit**

---

End of plan.
