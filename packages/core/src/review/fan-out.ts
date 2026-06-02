import type {
  ContextBundle,
  ReviewDomain,
  AgentReviewResult,
  FanOutOptions,
  ReviewFinding,
  ReviewSubagent,
} from './types';
import { runComplianceAgent } from './agents/compliance-agent';
import { runBugDetectionAgent } from './agents/bug-agent';
import { runSecurityAgent } from './agents/security-agent';
import { runArchitectureAgent } from './agents/architecture-agent';
import { runLearningsAgent } from './agents/learnings-agent';
import { runAdversarialAgent } from './agents/adversarial-agent';
import { runTypescriptStrictAgent } from './agents/typescript-strict-agent';
import { runFrontendRacesAgent } from './agents/frontend-races-agent';
import type { ConditionalSubagent, ReviewDepth } from './depth-calibrator';

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

/**
 * Result wrapper from a single conditional-subagent dispatch.
 */
export interface ConditionalAgentResult {
  /** Subagent identifier (matches `ReviewFinding.subagent`) */
  subagent: ConditionalSubagent;
  findings: ReviewFinding[];
  durationMs: number;
}

/**
 * Dispatch conditional subagents (adversarial, typescript-strict, frontend-races)
 * per the activation set computed in Phase 3.5.
 *
 * Each subagent receives the bug-domain ContextBundle (since their findings
 * sit under `domain: 'bug'` or `domain: 'architecture'`). Subagents that
 * are not in the activation set are skipped entirely — zero cost.
 */
export async function fanOutConditionalSubagents(options: {
  bundles: ContextBundle[];
  activations: Set<ConditionalSubagent>;
  depth: ReviewDepth;
}): Promise<ConditionalAgentResult[]> {
  const { bundles, activations, depth } = options;
  if (activations.size === 0 || bundles.length === 0) return [];

  const bugBundle = bundles.find((b) => b.domain === 'bug') ?? bundles[0]!;

  const tasks: Array<Promise<ConditionalAgentResult>> = [];

  if (activations.has('adversarial')) {
    tasks.push(
      Promise.resolve().then(() => {
        const start = Date.now();
        const findings = runAdversarialAgent(bugBundle, { runCascades: depth === 'deep' });
        return {
          subagent: 'adversarial' as const,
          findings,
          durationMs: Date.now() - start,
        };
      })
    );
  }

  if (activations.has('typescript-strict')) {
    tasks.push(
      Promise.resolve().then(() => {
        const start = Date.now();
        const findings = runTypescriptStrictAgent(bugBundle);
        return {
          subagent: 'typescript-strict' as const,
          findings,
          durationMs: Date.now() - start,
        };
      })
    );
  }

  if (activations.has('frontend-races')) {
    tasks.push(
      Promise.resolve().then(() => {
        const start = Date.now();
        const findings = runFrontendRacesAgent(bugBundle);
        return {
          subagent: 'frontend-races' as const,
          findings,
          durationMs: Date.now() - start,
        };
      })
    );
  }

  return Promise.all(tasks);
}

/**
 * Map a subagent identifier to a stable ordering rank for output formatting.
 */
export const SUBAGENT_ORDER: ReadonlyArray<ReviewSubagent> = [
  'compliance',
  'bug',
  'security',
  'architecture',
  'learnings',
  'adversarial',
  'typescript-strict',
  'frontend-races',
];
