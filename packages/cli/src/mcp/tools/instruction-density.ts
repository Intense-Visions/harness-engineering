import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeSkillInstructionDensity,
  DEFAULT_INSTRUCTION_BUDGET,
  type LevelInstructionDensity,
} from '@harness-engineering/core';

/**
 * Advisory SKILL.md instruction-density audit.
 *
 * Walks a project for `SKILL.md` files and, for each, measures the imperative
 * instruction count at every context-budget packing level (via
 * `analyzeSkillInstructionDensity`). Emits one advisory finding per skill whose
 * highest loaded level exceeds the budget. Non-blocking by contract — the caller
 * (`harness validate`) surfaces these at `warning` severity.
 *
 * Validates the progressive-disclosure mitigation HumanLayer's RPI→CRISPY
 * postmortem identified: planning prompts past a ~150-200 instruction-follow
 * budget were the specific break that forced a workflow rebuild ([HORTHY-2]).
 */

export interface InstructionDensityFinding {
  /** Repo-relative path to the SKILL.md. */
  file: string;
  /** The worst (highest-numbered) over-budget packing level for this skill. */
  level: LevelInstructionDensity;
  /** Budget the level was measured against. */
  budget: number;
  /** Human-readable advisory message. */
  message: string;
}

export interface InstructionDensityAuditOptions {
  /** Project root to walk. */
  path: string;
  /** Instruction budget per packing level. Defaults to DEFAULT_INSTRUCTION_BUDGET. */
  budget?: number;
}

export interface InstructionDensityAuditResult {
  budget: number;
  /** Physical SKILL.md files inspected (symlink mirrors deduplicated). */
  skillsScanned: number;
  findings: InstructionDensityFinding[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo']);

/**
 * Collect physical `SKILL.md` paths under `root`, deduplicating by real path so
 * the cursor / codex / gemini-cli skill mirrors (symlinks to the `claude-code`
 * copy) collapse to a single physical file and are not double-counted.
 */
function collectSkillFiles(root: string): string[] {
  const seenReal = new Set<string>();
  const results: string[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isSymbolicLink()) {
        // Resolve symlinked directories (skill mirrors) and symlinked files alike.
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(full);
        } else if (entry.name === 'SKILL.md') {
          addFile(full);
        }
      } else if (entry.name === 'SKILL.md') {
        addFile(full);
      }
    }
  };

  const addFile = (full: string): void => {
    let real: string;
    try {
      real = fs.realpathSync(full);
    } catch {
      real = full;
    }
    if (seenReal.has(real)) return;
    seenReal.add(real);
    results.push(full);
  };

  walk(root);
  return results;
}

export async function runInstructionDensityAudit(
  options: InstructionDensityAuditOptions
): Promise<InstructionDensityAuditResult> {
  const budget = options.budget ?? DEFAULT_INSTRUCTION_BUDGET;
  const root = path.resolve(options.path);
  const skillFiles = collectSkillFiles(root);
  const findings: InstructionDensityFinding[] = [];

  for (const file of skillFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const report = analyzeSkillInstructionDensity(content, budget);
    if (!report.maxLevelOverBudget) continue;
    const level = report.maxLevelOverBudget;
    const rel = path.relative(root, file).replaceAll('\\', '/') || file;
    findings.push({
      file: rel,
      level,
      budget,
      message:
        `Packing level ${level.level}/5 loads ${level.instructionCount} imperative instructions ` +
        `(> budget ${budget}) across ${level.sections} section(s). HumanLayer's RPI→CRISPY ` +
        `postmortem identified ~150-200 as the instruction-follow ceiling; consider splitting ` +
        `directives into a deeper packing level or a references/ file.`,
    });
  }

  return { budget, skillsScanned: skillFiles.length, findings };
}
