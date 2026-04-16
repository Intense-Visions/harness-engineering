import type { ChangeType, DiffInfo, Rubric, RubricItem } from './types';
import { detectChangeType } from './change-type';

/**
 * Options for generating a rubric.
 *
 * Note the absence of a `fileContents` field — this is intentional.
 * The rubric generator must not see the implementation, otherwise the
 * anti-rationalization property is lost. Only metadata is accepted.
 */
export interface GenerateRubricOptions {
  /** Diff metadata (file paths and counts only — no contents). */
  diff: DiffInfo;
  /** Most recent commit message. */
  commitMessage: string;
  /** Optional path to a spec document (title/summary is extracted at load time). */
  specFile?: string;
  /**
   * Optional LLM hook. When provided, its output is parsed as JSON
   * `{ items: RubricItem[] }` and returned. Callers supply their own
   * tokenizer/provider.
   */
  llm?: (prompt: string) => Promise<string>;
  /**
   * Optional deterministic clock for tests. Defaults to `() => new Date()`.
   */
  now?: () => Date;
}

const SECURITY_SENSITIVE_PATH = /(auth|crypto|secret|token|password|session|permission)/i;
const MIGRATION_PATH = /(migration|schema|db\/|database\/)/i;
const TEST_PATH = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/;
const CONFIG_PATH = /\.(json|yml|yaml|toml|ini|env)$/;

/**
 * Generate a task-specific rubric from change metadata only.
 *
 * Produces a deterministic, diff-shape-aware set of criteria *before*
 * the implementation is inspected. The rubric is later attached to
 * each ContextBundle so review agents can cite which criterion a
 * finding maps to.
 */
export async function generateRubric(opts: GenerateRubricOptions): Promise<Rubric> {
  const { diff, commitMessage, specFile, llm, now } = opts;
  const changeType = detectChangeType(commitMessage, diff);
  const timestamp = (now ?? (() => new Date()))().toISOString();

  // LLM path: caller is responsible for schema-compatible output.
  if (llm) {
    try {
      const prompt = buildRubricPrompt({
        changeType,
        diff,
        commitMessage,
        ...(specFile !== undefined ? { specFile } : {}),
      });
      const raw = await llm(prompt);
      const parsed = parseLlmRubric(raw);
      if (parsed) {
        return {
          changeType,
          items: parsed,
          generatedAt: timestamp,
          source: 'llm',
        };
      }
      // Fall through to heuristic if LLM output was unparseable.
    } catch {
      // Fall through to heuristic on any LLM failure.
    }
  }

  const items = buildHeuristicItems(changeType, diff, specFile);
  const sorted = sortRubricItems(items);

  return {
    changeType,
    items: sorted,
    generatedAt: timestamp,
    source: specFile ? 'spec-file' : 'heuristic',
  };
}

function buildHeuristicItems(
  changeType: ChangeType,
  diff: DiffInfo,
  specFile?: string
): RubricItem[] {
  const items: RubricItem[] = [];

  // Spec criteria ------------------------------------------------------
  if (specFile) {
    items.push({
      id: 'spec-acceptance',
      category: 'spec',
      title: 'Implementation satisfies documented acceptance criteria',
      mustHave: true,
      rationale: `Spec file ${specFile} defines explicit acceptance criteria that must be met.`,
    });
    items.push({
      id: 'spec-scope',
      category: 'spec',
      title: 'Changes remain within the scope described by the spec',
      mustHave: true,
      rationale: 'Scope creep introduces unreviewed risk and complicates rollback.',
    });
  }

  // Change-type-specific -----------------------------------------------
  if (changeType === 'feature') {
    items.push({
      id: 'feature-api-surface',
      category: 'quality',
      title: 'New public API surface is minimal and intentional',
      mustHave: true,
      rationale: 'New features are the primary source of long-term maintenance cost.',
    });
    items.push({
      id: 'feature-tests',
      category: 'quality',
      title: 'New behavior is covered by tests',
      mustHave: true,
      rationale: 'Features without tests regress silently.',
    });
  } else if (changeType === 'bugfix') {
    items.push({
      id: 'bugfix-regression-test',
      category: 'quality',
      title: 'A regression test exercises the fixed path',
      mustHave: true,
      rationale: 'Without a regression test, the bug can recur unnoticed.',
    });
    items.push({
      id: 'bugfix-root-cause',
      category: 'quality',
      title: 'Fix addresses the root cause, not just the symptom',
      mustHave: false,
      rationale: 'Symptomatic fixes tend to re-surface in adjacent paths.',
    });
  } else if (changeType === 'refactor') {
    items.push({
      id: 'refactor-no-behavior-change',
      category: 'quality',
      title: 'No behavioral change versus existing tests',
      mustHave: true,
      rationale: 'A refactor that changes behavior is actually a feature or fix in disguise.',
    });
  } else if (changeType === 'docs') {
    items.push({
      id: 'docs-accuracy',
      category: 'spec',
      title: 'Documentation reflects current code behavior',
      mustHave: true,
      rationale: 'Stale docs mislead future readers more than missing docs.',
    });
  }

  // Risk-surface criteria ---------------------------------------------
  const touchesSecurity = diff.changedFiles.some((f) => SECURITY_SENSITIVE_PATH.test(f));
  if (touchesSecurity) {
    items.push({
      id: 'risk-security-sensitive',
      category: 'risk',
      title: 'Security-sensitive paths are handled with defensive defaults',
      mustHave: true,
      rationale:
        'Diff touches auth/crypto/secret/token paths — input validation, error handling, and logging must be defensive.',
    });
  }

  const touchesMigration = diff.changedFiles.some((f) => MIGRATION_PATH.test(f));
  if (touchesMigration) {
    items.push({
      id: 'risk-migration-rollback',
      category: 'risk',
      title: 'Migration changes have a rollback path',
      mustHave: true,
      rationale: 'Unrolled-backable migrations require a plan before execute.',
    });
  }

  const newNonTest = diff.newFiles.filter(
    (f) => !TEST_PATH.test(f) && !CONFIG_PATH.test(f) && !f.endsWith('.md')
  );
  if (newNonTest.length >= 3) {
    items.push({
      id: 'quality-module-boundaries',
      category: 'quality',
      title: 'New modules respect established layer/boundary conventions',
      mustHave: false,
      rationale: `Diff introduces ${newNonTest.length} new non-test modules — check layer placement.`,
    });
  }

  if (diff.deletedFiles.length > 0) {
    items.push({
      id: 'quality-no-orphaned-references',
      category: 'quality',
      title: 'No orphaned references to deleted files remain',
      mustHave: true,
      rationale: `Diff deletes ${diff.deletedFiles.length} file(s) — imports, docs, and tests must follow.`,
    });
  }

  // Always-on baseline criterion --------------------------------------
  items.push({
    id: 'quality-observability',
    category: 'quality',
    title: 'Errors and side effects are observable via logs or metrics',
    mustHave: false,
    rationale: 'Silent failure is the most expensive kind.',
  });

  return items;
}

function sortRubricItems(items: readonly RubricItem[]): RubricItem[] {
  // Stable sort: mustHave first, then by category order (spec < quality < risk),
  // then by id for determinism.
  const categoryWeight: Record<RubricItem['category'], number> = {
    spec: 0,
    quality: 1,
    risk: 2,
  };
  return [...items].sort((a, b) => {
    if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
    const catDiff = categoryWeight[a.category] - categoryWeight[b.category];
    if (catDiff !== 0) return catDiff;
    return a.id.localeCompare(b.id);
  });
}

function buildRubricPrompt(args: {
  changeType: ChangeType;
  diff: DiffInfo;
  commitMessage: string;
  specFile?: string;
}): string {
  const { changeType, diff, commitMessage, specFile } = args;
  return [
    'Generate a review rubric BEFORE reading the implementation.',
    `Change type: ${changeType}`,
    `Commit: ${commitMessage}`,
    `Files changed: ${diff.changedFiles.length}`,
    specFile ? `Spec file: ${specFile}` : 'Spec file: (none)',
    '',
    'Respond with JSON: { "items": RubricItem[] } where each item has',
    'id, category (spec|quality|risk), title, mustHave (bool), rationale.',
  ].join('\n');
}

function parseLlmRubric(raw: string): RubricItem[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'items' in parsed &&
      Array.isArray((parsed as { items: unknown }).items)
    ) {
      const items = (parsed as { items: unknown[] }).items;
      const valid = items.filter(isRubricItem);
      return valid.length > 0 ? sortRubricItems(valid) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function isRubricItem(value: unknown): value is RubricItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.category === 'spec' || v.category === 'quality' || v.category === 'risk') &&
    typeof v.title === 'string' &&
    typeof v.mustHave === 'boolean' &&
    typeof v.rationale === 'string'
  );
}
