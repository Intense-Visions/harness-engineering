import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewItem,
  ReviewChecklist,
  SelfReviewConfig,
  CustomRule,
  FeedbackError,
} from '../types';
import { analyzeDiff } from './diff-analyzer';

export class ChecklistBuilder {
  private rootDir: string;
  private harnessOptions?: SelfReviewConfig['harness'];
  private customRules: CustomRule[] = [];
  private diffOptions?: SelfReviewConfig['diffAnalysis'];

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  withHarnessChecks(options?: SelfReviewConfig['harness']): this {
    this.harnessOptions = options ?? { context: true, constraints: true, entropy: true };
    return this;
  }

  addRule(rule: CustomRule): this {
    this.customRules.push(rule);
    return this;
  }

  addRules(rules: CustomRule[]): this {
    this.customRules.push(...rules);
    return this;
  }

  withDiffAnalysis(options: SelfReviewConfig['diffAnalysis']): this {
    this.diffOptions = options;
    return this;
  }

  async run(changes: CodeChanges): Promise<Result<ReviewChecklist, FeedbackError>> {
    const startTime = Date.now();
    const items: ReviewItem[] = [];

    // Run harness checks
    // Note: Harness module integration is deferred to a follow-up task.
    // This adds placeholder items indicating which checks would run.
    if (this.harnessOptions) {
      if (this.harnessOptions.context) {
        items.push({
          id: 'harness-context',
          category: 'harness',
          check: 'Context Engineering (AGENTS.md, doc coverage)',
          passed: true,
          severity: 'info',
          details: 'Harness context validation not yet integrated. See Module 2 (context/).',
          suggestion: 'Integrate with validateAgentsMap(), checkDocCoverage() from context module',
        });
      }
      if (this.harnessOptions.constraints) {
        items.push({
          id: 'harness-constraints',
          category: 'harness',
          check: 'Architectural Constraints (dependencies, boundaries)',
          passed: true,
          severity: 'info',
          details:
            'Harness constraints validation not yet integrated. See Module 3 (constraints/).',
          suggestion:
            'Integrate with validateDependencies(), detectCircularDeps() from constraints module',
        });
      }
      if (this.harnessOptions.entropy) {
        items.push({
          id: 'harness-entropy',
          category: 'harness',
          check: 'Entropy Management (drift, dead code)',
          passed: true,
          severity: 'info',
          details: 'Harness entropy validation not yet integrated. See Module 4 (entropy/).',
          suggestion: 'Integrate with EntropyAnalyzer from entropy module',
        });
      }
    }

    // Run custom rules
    for (const rule of this.customRules) {
      try {
        const result = await rule.check(changes, this.rootDir);
        const item: ReviewItem = {
          id: rule.id,
          category: 'custom',
          check: rule.name,
          passed: result.passed,
          severity: rule.severity,
          details: result.details,
        };
        if (result.suggestion !== undefined) {
          item.suggestion = result.suggestion;
        }
        if (result.file !== undefined) {
          item.file = result.file;
        }
        if (result.line !== undefined) {
          item.line = result.line;
        }
        items.push(item);
      } catch (error) {
        items.push({
          id: rule.id,
          category: 'custom',
          check: rule.name,
          passed: false,
          severity: 'error',
          details: `Rule execution failed: ${String(error)}`,
        });
      }
    }

    // Run diff analysis
    if (this.diffOptions) {
      const diffResult = await analyzeDiff(changes, this.diffOptions);
      if (diffResult.ok) {
        items.push(...diffResult.value);
      }
    }

    // Calculate summary
    const passed = items.filter((i) => i.passed).length;
    const failed = items.filter((i) => !i.passed).length;
    const errors = items.filter((i) => !i.passed && i.severity === 'error').length;
    const warnings = items.filter((i) => !i.passed && i.severity === 'warning').length;

    const checklist: ReviewChecklist = {
      items,
      passed: failed === 0, // Pass if no failed items
      summary: {
        total: items.length,
        passed,
        failed,
        errors,
        warnings,
      },
      duration: Date.now() - startTime,
    };

    return Ok(checklist);
  }
}
