import { z } from 'zod';
import type { RawWorkItem } from '../types.js';

/**
 * System prompt instructing the LLM to act as a spec enrichment agent.
 */
export const SEL_SYSTEM_PROMPT = `You are a spec enrichment agent. Your job is to analyze a work item (feature request, bug report, task, etc.) and produce structured output that captures the full engineering intent.

Analyze the provided work item and extract:
1. **intent** — a single sentence capturing the core engineering goal.
2. **summary** — a concise paragraph summarizing what needs to be done.
3. **affectedSystems** — an array of system/module names that will be touched (each as {name: string}).
4. **functionalRequirements** — concrete functional requirements implied by the work item.
5. **nonFunctionalRequirements** — performance, scalability, security, or reliability concerns.
6. **apiChanges** — any API surface changes (new endpoints, changed contracts, etc.).
7. **dbChanges** — any database schema or migration changes.
8. **integrationPoints** — external systems or services this work integrates with.
9. **assumptions** — assumptions you are making about the scope or context.
10. **unknowns** — things that are unclear and may need clarification.
11. **ambiguities** — parts of the spec that could be interpreted multiple ways.
12. **riskSignals** — potential risks (technical debt, breaking changes, security concerns, etc.).
13. **initialComplexityHints** — an object with two 0-1 scores:
    - textualComplexity: how complex the requirement text itself is (0 = trivial, 1 = extremely dense).
    - structuralComplexity: how many systems/layers are involved (0 = single module, 1 = cross-cutting).

Be thorough but concise. If information is missing or the description is empty, infer what you can from the title and labels, and note gaps in unknowns/ambiguities.

Return your analysis using the structured_output tool.`;

/**
 * Builds the user prompt from a RawWorkItem.
 */
export function buildUserPrompt(item: RawWorkItem): string {
  const parts: string[] = [];

  parts.push(`## Work Item: ${item.title}`);
  parts.push(`**ID:** ${item.id}`);
  parts.push(`**Source:** ${item.source}`);

  if (item.description) {
    parts.push(`\n### Description\n${item.description}`);
  } else {
    parts.push(`\n### Description\n_No description provided._`);
  }

  if (item.labels.length > 0) {
    parts.push(`\n### Labels\n${item.labels.join(', ')}`);
  }

  if (item.linkedItems.length > 0) {
    parts.push(`\n### Linked Items\n${item.linkedItems.join(', ')}`);
  }

  if (item.comments.length > 0) {
    parts.push(`\n### Comments\n${item.comments.join('\n\n')}`);
  }

  const metaEntries = Object.entries(item.metadata).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (metaEntries.length > 0) {
    parts.push(
      `\n### Metadata\n${metaEntries.map(([k, v]) => `- **${k}:** ${String(v)}`).join('\n')}`
    );
  }

  return parts.join('\n');
}

/**
 * Zod schema for the LLM response — matches EnrichedSpec fields minus
 * graph-validated fields (graphNodeId, transitiveDeps, testCoverage, owner).
 */
export const selResponseSchema = z.object({
  intent: z.string(),
  summary: z.string(),
  affectedSystems: z.array(z.object({ name: z.string() })),
  functionalRequirements: z.array(z.string()),
  nonFunctionalRequirements: z.array(z.string()),
  apiChanges: z.array(z.string()),
  dbChanges: z.array(z.string()),
  integrationPoints: z.array(z.string()),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
  ambiguities: z.array(z.string()),
  riskSignals: z.array(z.string()),
  initialComplexityHints: z.object({
    textualComplexity: z.number().min(0).max(1),
    structuralComplexity: z.number().min(0).max(1),
  }),
});

export type SELResponse = z.infer<typeof selResponseSchema>;
