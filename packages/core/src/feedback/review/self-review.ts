import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewChecklist,
  SelfReviewConfig,
  FeedbackError,
  GraphImpactData,
  GraphHarnessCheckData,
} from '../types';
import { ChecklistBuilder } from './checklist';

export async function createSelfReview(
  changes: CodeChanges,
  config: SelfReviewConfig,
  graphData?: { impact?: GraphImpactData; harness?: GraphHarnessCheckData }
): Promise<Result<ReviewChecklist, FeedbackError>> {
  const builder = new ChecklistBuilder(config.rootDir);

  // Add harness checks if configured
  if (config.harness) {
    builder.withHarnessChecks(config.harness, graphData?.harness);
  }

  // Add custom rules
  if (config.customRules) {
    builder.addRules(config.customRules);
  }

  // Add diff analysis
  if (config.diffAnalysis) {
    builder.withDiffAnalysis(config.diffAnalysis, graphData?.impact);
  }

  return builder.run(changes);
}

// Re-export ChecklistBuilder for direct use
export { ChecklistBuilder } from './checklist';
