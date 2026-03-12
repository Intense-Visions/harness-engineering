// AGENTS.md Validation
export {
  validateAgentsMap,
  extractMarkdownLinks,
  extractSections,
} from './agents-map';

// Documentation Coverage
export { checkDocCoverage } from './doc-coverage';

// Knowledge Map Integrity
export { validateKnowledgeMap } from './knowledge-map';

// AGENTS.md Generation
export { generateAgentsMap } from './generate';

// Types
export type {
  AgentMapLink,
  AgentMapSection,
  AgentMapValidation,
  DocumentationGap,
  CoverageReport,
  CoverageOptions,
  BrokenLink,
  IntegrityReport,
  GenerationSection,
  AgentsMapConfig,
} from './types';

export { REQUIRED_SECTIONS } from './types';
