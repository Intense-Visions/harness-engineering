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

  /**
   * Build a single harness check item with or without graph data.
   */
  private buildHarnessCheckItem(
    id: string,
    check: string,
    fallbackDetails: string,
    graphItemBuilder?: () => ReviewItem
  ): ReviewItem {
    if (this.graphHarnessData && graphItemBuilder) {
      return graphItemBuilder();
    }
    return {
      id,
      category: 'harness',
      check,
      passed: true,
      severity: 'info',
      details: fallbackDetails,
    };
  }

  /**
   * Build all harness check items based on harnessOptions and graph data.
   */
  private buildHarnessItems(): ReviewItem[] {
    if (!this.harnessOptions) return [];

    const items: ReviewItem[] = [];
    const graphData = this.graphHarnessData;

    if (this.harnessOptions.context !== false) {
      items.push(
        this.buildHarnessCheckItem(
          'harness-context',
          'Context validation',
          'Harness context validation not yet integrated (run with graph for real checks)',
          graphData
            ? () => ({
                id: 'harness-context',
                category: 'harness' as const,
                check: 'Context validation',
                passed: graphData.graphExists && graphData.nodeCount > 0,
                severity: 'info' as const,
                details: graphData.graphExists
                  ? `Graph loaded: ${graphData.nodeCount} nodes, ${graphData.edgeCount} edges`
                  : 'No graph available — run harness scan to build the knowledge graph',
              })
            : undefined
        )
      );
    }

    if (this.harnessOptions.constraints !== false) {
      items.push(
        this.buildHarnessCheckItem(
          'harness-constraints',
          'Constraint validation',
          'Harness constraint validation not yet integrated (run with graph for real checks)',
          graphData
            ? () => {
                const violations = graphData.constraintViolations;
                return {
                  id: 'harness-constraints',
                  category: 'harness' as const,
                  check: 'Constraint validation',
                  passed: violations === 0,
                  severity: (violations > 0 ? 'error' : 'info') as ReviewItem['severity'],
                  details:
                    violations === 0
                      ? 'No constraint violations detected'
                      : `${violations} constraint violation(s) detected`,
                };
              }
            : undefined
        )
      );
    }

    if (this.harnessOptions.entropy !== false) {
      items.push(
        this.buildHarnessCheckItem(
          'harness-entropy',
          'Entropy detection',
          'Harness entropy detection not yet integrated (run with graph for real checks)',
          graphData
            ? () => {
                const issues = graphData.unreachableNodes + graphData.undocumentedFiles;
                return {
                  id: 'harness-entropy',
                  category: 'harness' as const,
                  check: 'Entropy detection',
                  passed: issues === 0,
                  severity: (issues > 0 ? 'warning' : 'info') as ReviewItem['severity'],
                  details:
                    issues === 0
                      ? 'No entropy issues detected'
                      : `${graphData.unreachableNodes} unreachable node(s), ${graphData.undocumentedFiles} undocumented file(s)`,
                };
              }
            : undefined
        )
      );
    }

    return items;
  }

  /**
   * Execute a single custom rule and return a ReviewItem.
   */
  private async executeCustomRule(rule: CustomRule, changes: CodeChanges): Promise<ReviewItem> {
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
      if (result.suggestion !== undefined) item.suggestion = result.suggestion;
      if (result.file !== undefined) item.file = result.file;
      if (result.line !== undefined) item.line = result.line;
      return item;
    } catch (error) {
      return {
        id: rule.id,
        category: 'custom',
        check: rule.name,
        passed: false,
        severity: 'error',
        details: `Rule execution failed: ${String(error)}`,
      };
    }
  }

  async run(changes: CodeChanges): Promise<Result<ReviewChecklist, FeedbackError>> {
    const startTime = Date.now();
    const items: ReviewItem[] = [];

    // Run harness checks
    items.push(...this.buildHarnessItems());

    // Run custom rules
    for (const rule of this.customRules) {
      items.push(await this.executeCustomRule(rule, changes));
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
      passed: failed === 0,
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
