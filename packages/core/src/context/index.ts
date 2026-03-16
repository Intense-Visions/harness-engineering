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

// Token Budget
export { contextBudget } from './budget';
export type { TokenBudget, TokenBudgetOverrides } from './budget.types';

// Context Filter
export { contextFilter, getPhaseCategories } from './filter';
export type { WorkflowPhase, FileCategory, ContextFilterResult } from './filter.types';

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
