import type { LoadingLevel } from '@harness-engineering/types';
import { extractLevel, parseSections } from './section-parser';

/**
 * Instruction-density estimation for SKILL.md bodies.
 *
 * HumanLayer's public RPI→CRISPY postmortem found that planning prompts which
 * exceeded a ~150-200 instruction-follow budget were the specific failure that
 * forced a full workflow rebuild. This module measures the *imperative
 * instruction* count a skill presents at each context-budget packing level (the
 * cumulative levels {@link extractLevel} already loads), so progressive
 * disclosure — the mitigation being validated — is measured per loaded level
 * rather than over the whole file. See
 * `docs/research/dex-horthy-humanlayer-comparison-analysis.md` [HORTHY-2].
 */

/**
 * Default per-level instruction budget. The midpoint of HumanLayer's identified
 * ~150-200 instruction-follow ceiling. A packing level whose imperative
 * instruction count exceeds this is surfaced as an advisory (non-blocking)
 * warning; it is never a hard failure. Overridable via `skills.instructionBudget`.
 */
export const DEFAULT_INSTRUCTION_BUDGET = 175;

/**
 * Imperative verbs that mark a bullet as an instruction to follow. Matched
 * case-insensitively against the first word of a `-`/`*` bullet. Curated from the
 * verbs that actually open directive bullets across the harness skill corpus;
 * intentionally conservative — a bullet that merely states a fact ("Existing JWT
 * middleware") is not counted.
 */
const IMPERATIVE_VERBS = new Set(
  [
    'run',
    'call',
    'read',
    'write',
    'add',
    'check',
    'verify',
    'ensure',
    'use',
    'set',
    'create',
    'do',
    'stop',
    'ask',
    'emit',
    'commit',
    'skip',
    'continue',
    'cite',
    'apply',
    'present',
    'wait',
    'fix',
    'remove',
    'update',
    'derive',
    'branch',
    'surface',
    'record',
    'reject',
    'avoid',
    'prefer',
    'never',
    'always',
    'load',
    'select',
    'choose',
    'propose',
    'identify',
    'acknowledge',
    'track',
    'resolve',
    'scan',
    'extract',
    'announce',
    'request',
    'promote',
    'transition',
    'return',
    'treat',
    'flag',
    'define',
    'populate',
    'follow',
    'invoke',
    'pass',
    'wire',
    'register',
    'append',
    'include',
    'exclude',
    'validate',
    'confirm',
    'dispatch',
    'capture',
    'consume',
    'note',
    'assess',
    'decompose',
    'narrow',
    'consider',
    'replace',
    'delete',
    'declare',
    'map',
    'walk',
    'count',
    'report',
    'store',
  ].map((v) => v.toLowerCase())
);

const NUMBERED_STEP = /^\s*\d+[.)]\s+\S/;
const BULLET = /^\s*[-*]\s+(\S+)/;
/** SCREAMING directive tokens. Case-sensitive to avoid prose false positives. */
const DIRECTIVE = /\b(MUST|SHALL|REQUIRED)\b/;
const CODE_FENCE = /^\s*(```|~~~)/;

/**
 * Count imperative instructions in a block of markdown.
 *
 * An "instruction" is any of:
 * - a numbered step (`1.` / `2)` list marker),
 * - an imperative-verb bullet (`-`/`*` whose first word is an imperative verb),
 * - a directive line carrying a `MUST` / `SHALL` / `REQUIRED` token.
 *
 * Content inside fenced code blocks is ignored so example snippets do not inflate
 * the count. Each line counts at most once. This is a deterministic heuristic, not
 * an NLP parser — it estimates the instruction-follow load, not exact semantics.
 */
export function countImperativeInstructions(markdown: string): number {
  if (!markdown.trim()) return 0;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let count = 0;
  let inFence = false;

  for (const line of lines) {
    if (CODE_FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (NUMBERED_STEP.test(line)) {
      count += 1;
      continue;
    }

    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      const firstWord = bulletMatch[1]!.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (IMPERATIVE_VERBS.has(firstWord)) {
        count += 1;
        continue;
      }
    }

    if (DIRECTIVE.test(line)) {
      count += 1;
    }
  }

  return count;
}

/** Instruction density measured at a single cumulative packing level. */
export interface LevelInstructionDensity {
  /** Packing level 1..5. Level 5 is the full body. */
  level: LoadingLevel;
  /** Number of sections included at (or below) this level. */
  sections: number;
  /** Imperative instructions in the cumulative content loaded at this level. */
  instructionCount: number;
  /** True when {@link instructionCount} exceeds the budget. */
  overBudget: boolean;
}

/** Per-level instruction-density report for one SKILL.md body. */
export interface SkillInstructionDensityReport {
  /** Budget the levels were measured against. */
  budget: number;
  /** Density at each cumulative packing level 1..5. */
  levels: LevelInstructionDensity[];
  /**
   * The highest-numbered level whose instruction count exceeds the budget, or
   * `null` when every loaded level is within budget. The highest level carries
   * the most content (packing is cumulative), so this is the worst case.
   */
  maxLevelOverBudget: LevelInstructionDensity | null;
}

const LEVELS: readonly LoadingLevel[] = [1, 2, 3, 4, 5];

/** Strip the injected context-budget marker so it does not skew the count. */
function stripBudgetMarker(content: string): string {
  return content.replace(/<!-- context-budget:[^>]*-->\s*$/m, '');
}

/**
 * Measure imperative-instruction density at each cumulative packing level of a
 * SKILL.md body. Re-uses {@link extractLevel} so the content measured at each
 * level is exactly what `run_skill` loads there — progressive disclosure is the
 * mitigation being validated, so density is estimated per loaded level rather
 * than over the whole file.
 */
export function analyzeSkillInstructionDensity(
  content: string,
  budget: number = DEFAULT_INSTRUCTION_BUDGET
): SkillInstructionDensityReport {
  const totalSections = parseSections(content).length;
  const levels: LevelInstructionDensity[] = LEVELS.map((level) => {
    const packed = stripBudgetMarker(extractLevel(content, level));
    const includedSections = parseSections(packed).length || (level === 5 ? totalSections : 0);
    const instructionCount = countImperativeInstructions(packed);
    return {
      level,
      sections: includedSections,
      instructionCount,
      overBudget: instructionCount > budget,
    };
  });

  const overBudgetLevels = levels.filter((l) => l.overBudget);
  const maxLevelOverBudget =
    overBudgetLevels.length > 0 ? overBudgetLevels[overBudgetLevels.length - 1]! : null;

  return { budget, levels, maxLevelOverBudget };
}
