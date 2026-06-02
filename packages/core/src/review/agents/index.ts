// Agent implementations
export { runComplianceAgent, COMPLIANCE_DESCRIPTOR } from './compliance-agent';
export { runBugDetectionAgent, BUG_DETECTION_DESCRIPTOR } from './bug-agent';
export { runSecurityAgent, SECURITY_DESCRIPTOR } from './security-agent';
export { runArchitectureAgent, ARCHITECTURE_DESCRIPTOR } from './architecture-agent';
export { runLearningsAgent, LEARNINGS_DESCRIPTOR } from './learnings-agent';
export { runAdversarialAgent, ADVERSARIAL_DESCRIPTOR } from './adversarial-agent';
export { runTypescriptStrictAgent, TYPESCRIPT_STRICT_DESCRIPTOR } from './typescript-strict-agent';
export { runFrontendRacesAgent, FRONTEND_RACES_DESCRIPTOR } from './frontend-races-agent';

import type { ReviewAgentDescriptor, ReviewDomain, ReviewSubagent } from '../types';
import { COMPLIANCE_DESCRIPTOR } from './compliance-agent';
import { BUG_DETECTION_DESCRIPTOR } from './bug-agent';
import { SECURITY_DESCRIPTOR } from './security-agent';
import { ARCHITECTURE_DESCRIPTOR } from './architecture-agent';
import { LEARNINGS_DESCRIPTOR } from './learnings-agent';
import { ADVERSARIAL_DESCRIPTOR } from './adversarial-agent';
import { TYPESCRIPT_STRICT_DESCRIPTOR } from './typescript-strict-agent';
import { FRONTEND_RACES_DESCRIPTOR } from './frontend-races-agent';

/**
 * All agent descriptors indexed by domain.
 * Used by the fan-out orchestrator to dispatch agents and by output formatting
 * to display agent metadata.
 */
export const AGENT_DESCRIPTORS: Record<ReviewDomain, ReviewAgentDescriptor> = {
  compliance: COMPLIANCE_DESCRIPTOR,
  bug: BUG_DETECTION_DESCRIPTOR,
  security: SECURITY_DESCRIPTOR,
  architecture: ARCHITECTURE_DESCRIPTOR,
  learnings: LEARNINGS_DESCRIPTOR,
};

/**
 * Conditional subagent descriptors indexed by subagent identifier. The dispatcher
 * reads the activation set from the depth calibrator (Phase 3.5) and invokes
 * only those whose key is present.
 */
export const CONDITIONAL_SUBAGENT_DESCRIPTORS: Record<
  Exclude<ReviewSubagent, ReviewDomain>,
  ReviewAgentDescriptor
> = {
  adversarial: ADVERSARIAL_DESCRIPTOR,
  'typescript-strict': TYPESCRIPT_STRICT_DESCRIPTOR,
  'frontend-races': FRONTEND_RACES_DESCRIPTOR,
};
