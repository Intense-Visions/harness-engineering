export type { ExtractionRecord, SignalExtractor, Language } from './types.js';
export { ExtractionRunner, detectLanguage } from './ExtractionRunner.js';
export { TestDescriptionExtractor } from './TestDescriptionExtractor.js';
export { EnumConstantExtractor } from './EnumConstantExtractor.js';
export { ValidationRuleExtractor } from './ValidationRuleExtractor.js';
export { ApiPathExtractor } from './ApiPathExtractor.js';

import { TestDescriptionExtractor } from './TestDescriptionExtractor.js';
import { EnumConstantExtractor } from './EnumConstantExtractor.js';
import { ValidationRuleExtractor } from './ValidationRuleExtractor.js';
import { ApiPathExtractor } from './ApiPathExtractor.js';
import { ExtractionRunner } from './ExtractionRunner.js';
import type { SignalExtractor } from './types.js';

/** All built-in code signal extractors. */
export const ALL_EXTRACTORS: readonly SignalExtractor[] = [
  new TestDescriptionExtractor(),
  new EnumConstantExtractor(),
  new ValidationRuleExtractor(),
  new ApiPathExtractor(),
];

/** Create an ExtractionRunner with all built-in extractors. */
export function createExtractionRunner(): ExtractionRunner {
  return new ExtractionRunner(ALL_EXTRACTORS);
}
