import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { RawWorkItem, EnrichedSpec } from '../types.js';
import type { GraphValidator } from './graph-validator.js';
import { SEL_SYSTEM_PROMPT, buildUserPrompt, selResponseSchema } from './prompts.js';
import type { SELResponse } from './prompts.js';

/**
 * Enrich a RawWorkItem into a full EnrichedSpec via LLM analysis and graph validation.
 *
 * 1. Calls the AnalysisProvider with SEL prompts and response schema
 * 2. Parses the LLM response into a partial EnrichedSpec
 * 3. Validates affected systems against the knowledge graph
 * 4. Returns a fully populated EnrichedSpec
 */
export async function enrich(
  item: RawWorkItem,
  provider: AnalysisProvider,
  graphValidator: GraphValidator
): Promise<EnrichedSpec> {
  const response = await provider.analyze<SELResponse>({
    prompt: buildUserPrompt(item),
    systemPrompt: SEL_SYSTEM_PROMPT,
    responseSchema: selResponseSchema,
  });

  const llmResult = response.result;

  // Validate affected systems against the graph
  const affectedSystems = graphValidator.validate(llmResult.affectedSystems);

  return {
    id: item.id,
    title: item.title,
    intent: llmResult.intent,
    summary: llmResult.summary,
    affectedSystems,
    functionalRequirements: llmResult.functionalRequirements,
    nonFunctionalRequirements: llmResult.nonFunctionalRequirements,
    apiChanges: llmResult.apiChanges,
    dbChanges: llmResult.dbChanges,
    integrationPoints: llmResult.integrationPoints,
    assumptions: llmResult.assumptions,
    unknowns: llmResult.unknowns,
    ambiguities: llmResult.ambiguities,
    riskSignals: llmResult.riskSignals,
    initialComplexityHints: llmResult.initialComplexityHints,
  };
}
