import { z } from 'zod';
import type { EnrichedSpec, ComplexityScore } from '../types.js';

/**
 * System prompt for PESL full simulation.
 */
export const PESL_SYSTEM_PROMPT = `You are a pre-execution simulation agent. Your job is to analyze an enriched specification and its complexity assessment, then simulate what would happen if an autonomous coding agent attempted to implement this change.

Your simulation should:
1. **Plan expansion** -- Break the spec into concrete implementation steps a coding agent would take.
2. **Dependency simulation** -- For each step, identify what files, modules, or services would be touched and what dependencies exist between steps.
3. **Failure injection** -- Predict likely failure modes: type errors, missing imports, test regressions, breaking API changes, race conditions, etc.
4. **Test projection** -- Identify what tests should exist but don't, and what existing tests are likely to break.

Be realistic and specific. Reference actual system names from the spec. Err on the side of flagging potential issues -- it is better to over-predict failures than to miss them.

Return your analysis using the structured_output tool.`;

/**
 * Zod schema for the LLM simulation response.
 */
export const peslResponseSchema = z.object({
  simulatedPlan: z.array(z.string()).describe('Ordered implementation steps the agent would take'),
  predictedFailures: z.array(z.string()).describe('Likely failure modes during implementation'),
  riskHotspots: z.array(z.string()).describe('Files or modules that are high-risk change points'),
  missingSteps: z.array(z.string()).describe('Steps the agent might miss or overlook'),
  testGaps: z.array(z.string()).describe('Tests that should exist but likely do not'),
  recommendedChanges: z.array(z.string()).describe('Adjustments to improve success likelihood'),
});

export type PESLResponse = z.infer<typeof peslResponseSchema>;

/** Append a markdown section with a heading and bulleted items, if non-empty. */
function appendSection(parts: string[], heading: string, items: readonly string[]): void {
  if (items.length === 0) return;
  parts.push(`\n### ${heading}`);
  for (const item of items) {
    parts.push(`- ${item}`);
  }
}

/** Build the affected-systems section lines. */
function buildAffectedSystems(spec: EnrichedSpec): string[] {
  const lines: string[] = [`\n### Affected Systems`];
  for (const system of spec.affectedSystems) {
    const graphStatus = system.graphNodeId
      ? `(graph-resolved: ${system.graphNodeId})`
      : '(not in graph)';
    lines.push(
      `- **${system.name}** ${graphStatus} -- confidence: ${system.confidence}, deps: ${system.transitiveDeps.length}, test coverage: ${system.testCoverage}`
    );
  }
  return lines;
}

/** Build the complexity assessment section lines. */
function buildComplexitySection(score: ComplexityScore): string[] {
  const lines: string[] = [
    `\n### Complexity Assessment`,
    `- **Overall:** ${score.overall.toFixed(2)} (risk: ${score.riskLevel})`,
    `- **Blast radius:** ${score.blastRadius.filesEstimated} files, ${score.blastRadius.modules} modules, ${score.blastRadius.services} services`,
    `- **Structural:** ${score.dimensions.structural.toFixed(2)}`,
    `- **Semantic:** ${score.dimensions.semantic.toFixed(2)}`,
  ];
  for (const reason of score.reasoning) {
    lines.push(`- ${reason}`);
  }
  return lines;
}

/**
 * Build the user prompt for PESL full simulation from an EnrichedSpec and ComplexityScore.
 */
export function buildPeslPrompt(spec: EnrichedSpec, score: ComplexityScore): string {
  const parts: string[] = [
    `## Enriched Specification: ${spec.title}`,
    `**Intent:** ${spec.intent}`,
    `**Summary:** ${spec.summary}`,
  ];

  parts.push(...buildAffectedSystems(spec));

  appendSection(parts, 'Functional Requirements', spec.functionalRequirements);
  appendSection(parts, 'Non-Functional Requirements', spec.nonFunctionalRequirements);
  appendSection(parts, 'API Changes', spec.apiChanges);
  appendSection(parts, 'Database Changes', spec.dbChanges);
  appendSection(parts, 'Integration Points', spec.integrationPoints);
  appendSection(parts, 'Unknowns', spec.unknowns);
  appendSection(parts, 'Ambiguities', spec.ambiguities);
  appendSection(parts, 'Risk Signals', spec.riskSignals);

  parts.push(...buildComplexitySection(score));

  parts.push(`\n### Instructions`);
  parts.push(
    `Simulate implementation of this spec by an autonomous coding agent. Produce a step-by-step plan, predict failures, identify risk hotspots, flag missing steps, and project test gaps.`
  );

  return parts.join('\n');
}
