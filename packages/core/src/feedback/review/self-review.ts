import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewChecklist,
  SelfReviewConfig,
  FeedbackError,
} from '../types';
import { ChecklistBuilder } from './checklist';

export async function createSelfReview(
  changes: CodeChanges,
  config: SelfReviewConfig
): Promise<Result<ReviewChecklist, FeedbackError>> {
  const builder = new ChecklistBuilder(config.rootDir);

  // Add harness checks if configured
  if (config.harness) {
    builder.withHarnessChecks(config.harness);
  }

  // Add custom rules
  if (config.customRules) {
    builder.addRules(config.customRules);
  }

  // Add diff analysis
  if (config.diffAnalysis) {
    builder.withDiffAnalysis(config.diffAnalysis);
  }

  return builder.run(changes);
}

// Re-export ChecklistBuilder for direct use
export { ChecklistBuilder } from './checklist';
