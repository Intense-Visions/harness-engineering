import type {
  ContextBundle,
  ReviewDomain,
  AgentReviewResult,
  FanOutOptions,
  ReviewFinding,
} from './types';
import { runComplianceAgent } from './agents/compliance-agent';
import { runBugDetectionAgent } from './agents/bug-agent';
import { runSecurityAgent } from './agents/security-agent';
import { runArchitectureAgent } from './agents/architecture-agent';
import { runLearningsAgent } from './agents/learnings-agent';

/**
 * Registry mapping each review domain to its agent function.
 */
const AGENT_RUNNERS: Record<ReviewDomain, (bundle: ContextBundle) => ReviewFinding[]> = {
  compliance: runComplianceAgent,
  bug: runBugDetectionAgent,
  security: runSecurityAgent,
  architecture: runArchitectureAgent,
  learnings: runLearningsAgent,
};

/**
 * Run a single review agent and measure its duration.
 */
async function runAgent(bundle: ContextBundle): Promise<AgentReviewResult> {
  const start = Date.now();
  const runner = AGENT_RUNNERS[bundle.domain];
  const findings = runner(bundle);
  const durationMs = Date.now() - start;

  return {
    domain: bundle.domain,
    findings,
    durationMs,
  };
}

/**
 * Fan out review to all agents in parallel.
 *
 * Dispatches one agent per context bundle (each bundle targets a specific domain).
 * All agents run concurrently via Promise.all.
 *
 * Currently dispatches synchronous heuristic agents. Parallelism becomes
 * meaningful when agents perform async LLM calls (Phase 8 model tiering).
 *
 * Returns an AgentReviewResult per domain, each containing the findings
 * and timing information.
 */
export async function fanOutReview(options: FanOutOptions): Promise<AgentReviewResult[]> {
  const { bundles } = options;

  if (bundles.length === 0) return [];

  // Dispatch all agents in parallel
  const results = await Promise.all(bundles.map((bundle) => runAgent(bundle)));

  return results;
}
