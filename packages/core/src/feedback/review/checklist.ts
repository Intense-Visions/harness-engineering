import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewItem,
  ReviewChecklist,
  SelfReviewConfig,
  CustomRule,
  FeedbackError,
  GraphHarnessCheckData,
  GraphImpactData,
} from '../types';
import { analyzeDiff } from './diff-analyzer';

export class ChecklistBuilder {
  private rootDir: string;
  private harnessOptions?: SelfReviewConfig['harness'];
  private graphHarnessData?: GraphHarnessCheckData | undefined;
  private customRules: CustomRule[] = [];
  private diffOptions?: SelfReviewConfig['diffAnalysis'];
  private graphImpactData?: GraphImpactData | undefined;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  withHarnessChecks(
    options?: SelfReviewConfig['harness'],
    graphData?: GraphHarnessCheckData
  ): this {
    this.harnessOptions = options ?? { context: true, constraints: true, entropy: true };
    this.graphHarnessData = graphData;
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

  withDiffAnalysis(
    options: SelfReviewConfig['diffAnalysis'],
    graphImpactData?: GraphImpactData
  ): this {
    this.diffOptions = options;
    this.graphImpactData = graphImpactData;
    return this;
  }

  async run(changes: CodeChanges): Promise<Result<ReviewChecklist, FeedbackError>> {
    const startTime = Date.now();
    const items: ReviewItem[] = [];

    // Run harness checks
    // Note: Harness module integration is deferred to a follow-up task.
    // This adds placeholder items indicating which checks would run.
    if (this.harnessOptions) {
      if (this.harnessOptions.context !== false) {
        if (this.graphHarnessData) {
          items.push({
            id: 'harness-context',
            category: 'harness',
            check: 'Context validation',
            passed: this.graphHarnessData.graphExists && this.graphHarnessData.nodeCount > 0,
            severity: 'info',
            details: this.graphHarnessData.graphExists
              ? `Graph loaded: ${this.graphHarnessData.nodeCount} nodes, ${this.graphHarnessData.edgeCount} edges`
              : 'No graph available — run harness scan to build the knowledge graph',
          });
        } else {
          items.push({
            id: 'harness-context',
            category: 'harness',
            check: 'Context validation',
            passed: true,
            severity: 'info',
            details:
              'Harness context validation not yet integrated (run with graph for real checks)',
          });
        }
      }
      if (this.harnessOptions.constraints !== false) {
        if (this.graphHarnessData) {
          const violations = this.graphHarnessData.constraintViolations;
          items.push({
            id: 'harness-constraints',
            category: 'harness',
            check: 'Constraint validation',
            passed: violations === 0,
            severity: violations > 0 ? 'error' : 'info',
            details:
              violations === 0
                ? 'No constraint violations detected'
                : `${violations} constraint violation(s) detected`,
          });
        } else {
          items.push({
            id: 'harness-constraints',
            category: 'harness',
            check: 'Constraint validation',
            passed: true,
            severity: 'info',
            details:
              'Harness constraint validation not yet integrated (run with graph for real checks)',
          });
        }
      }
      if (this.harnessOptions.entropy !== false) {
        if (this.graphHarnessData) {
          const issues =
            this.graphHarnessData.unreachableNodes + this.graphHarnessData.undocumentedFiles;
          items.push({
            id: 'harness-entropy',
            category: 'harness',
            check: 'Entropy detection',
            passed: issues === 0,
            severity: issues > 0 ? 'warning' : 'info',
            details:
              issues === 0
                ? 'No entropy issues detected'
                : `${this.graphHarnessData.unreachableNodes} unreachable node(s), ${this.graphHarnessData.undocumentedFiles} undocumented file(s)`,
          });
        } else {
          items.push({
            id: 'harness-entropy',
            category: 'harness',
            check: 'Entropy detection',
            passed: true,
            severity: 'info',
            details:
              'Harness entropy detection not yet integrated (run with graph for real checks)',
          });
        }
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
      const diffResult = await analyzeDiff(changes, this.diffOptions, this.graphImpactData);
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
