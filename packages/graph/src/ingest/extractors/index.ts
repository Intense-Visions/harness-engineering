export type { ExtractionRecord, SignalExtractor, Language } from './types.js';
export {
  ExtractionRunner,
  detectLanguage,
  DEFAULT_EXTRACTION_EXCLUDE,
} from './ExtractionRunner.js';
export type { ExtractionRunResult } from './ExtractionRunner.js';
export { TestDescriptionExtractor } from './TestDescriptionExtractor.js';
export { EnumConstantExtractor } from './EnumConstantExtractor.js';
export { ValidationRuleExtractor } from './ValidationRuleExtractor.js';
export { ApiPathExtractor } from './ApiPathExtractor.js';

import { TestDescriptionExtractor } from './TestDescriptionExtractor.js';
import { EnumConstantExtractor } from './EnumConstantExtractor.js';
import { ValidationRuleExtractor } from './ValidationRuleExtractor.js';
import { ApiPathExtractor } from './ApiPathExtractor.js';
import { ExtractionRunner, DEFAULT_EXTRACTION_EXCLUDE } from './ExtractionRunner.js';
import type { SignalExtractor } from './types.js';

/** All built-in code signal extractors. */
export const ALL_EXTRACTORS: readonly SignalExtractor[] = [
  new TestDescriptionExtractor(),
  new EnumConstantExtractor(),
  new ValidationRuleExtractor(),
  new ApiPathExtractor(),
];

/**
 * Create an ExtractionRunner with all built-in extractors.
 *
 * @param additionalExcludes - Caller-supplied exclude globs that *extend* the
 *   built-in {@link DEFAULT_EXTRACTION_EXCLUDE} set (sourced by the CLI from
 *   `knowledge.extractionExclude`). Test files and fixture trees are always
 *   excluded regardless.
 */
export function createExtractionRunner(
  additionalExcludes: readonly string[] = []
): ExtractionRunner {
  return new ExtractionRunner(ALL_EXTRACTORS, {
    excludeGlobs: [...DEFAULT_EXTRACTION_EXCLUDE, ...additionalExcludes],
  });
}
