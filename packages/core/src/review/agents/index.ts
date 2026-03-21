// Agent implementations
export { runComplianceAgent, COMPLIANCE_DESCRIPTOR } from './compliance-agent';
export { runBugDetectionAgent, BUG_DETECTION_DESCRIPTOR } from './bug-agent';
export { runSecurityAgent, SECURITY_DESCRIPTOR } from './security-agent';
export { runArchitectureAgent, ARCHITECTURE_DESCRIPTOR } from './architecture-agent';

import type { ReviewAgentDescriptor, ReviewDomain } from '../types';
import { COMPLIANCE_DESCRIPTOR } from './compliance-agent';
import { BUG_DETECTION_DESCRIPTOR } from './bug-agent';
import { SECURITY_DESCRIPTOR } from './security-agent';
import { ARCHITECTURE_DESCRIPTOR } from './architecture-agent';

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
};
