import type { GraphStore } from '@harness-engineering/graph';
import type { EnrichedSpec, ComplexityScore } from '../types.js';
import { computeStructuralComplexity } from './structural.js';
import { computeSemanticComplexity } from './semantic.js';

/** Dimension weights for computing overall score. */
const W_STRUCTURAL = 0.5;
const W_SEMANTIC = 0.35;
const W_HISTORICAL = 0.15;

function computeConfidence(structuralScore: number, semanticScore: number): number {
  const hasStructural = structuralScore > 0;
  const hasSemantic = semanticScore > 0;
  if (hasStructural && hasSemantic) return 0.8;
  if (hasStructural || hasSemantic) return 0.5;
  return 0.3;
}

function classifyRiskLevel(overall: number): ComplexityScore['riskLevel'] {
  if (overall >= 0.8) return 'critical';
  if (overall >= 0.6) return 'high';
  if (overall >= 0.3) return 'medium';
  return 'low';
}

function determineRoute(
  riskLevel: ComplexityScore['riskLevel'],
  semantic: number
): ComplexityScore['recommendedRoute'] {
  if (riskLevel === 'low') return 'local';
  if (riskLevel === 'medium' && semantic < 0.5) return 'local';
  if (riskLevel === 'high' || riskLevel === 'critical') return 'human';
  return 'simulation-required';
}

/**
 * Score an enriched spec using the Complexity Modeling Layer (CML).
 *
 * Combines structural (graph-based blast radius), semantic (SEL enrichment
 * fields), and historical (placeholder) dimensions into a single
 * {@link ComplexityScore}.
 */
export function score(spec: EnrichedSpec, store: GraphStore): ComplexityScore {
  const structural = computeStructuralComplexity(spec, store);
  const semantic = computeSemanticComplexity(spec);
  const historical = 0; // Phase 3 placeholder

  const overall =
    structural.score * W_STRUCTURAL + semantic * W_SEMANTIC + historical * W_HISTORICAL;

  const confidence = computeConfidence(structural.score, semantic);
  const riskLevel = classifyRiskLevel(overall);
  const recommendedRoute = determineRoute(riskLevel, semantic);

  const reasoning = [
    `Structural complexity: ${structural.score.toFixed(2)} (${structural.blastRadius.filesEstimated} files, ${structural.blastRadius.services} services, ${structural.blastRadius.modules} modules affected)`,
    `Semantic complexity: ${semantic.toFixed(2)} (${spec.unknowns.length} unknowns, ${spec.ambiguities.length} ambiguities, ${spec.riskSignals.length} risk signals)`,
    `Historical complexity: ${historical.toFixed(2)} (Phase 3 placeholder)`,
    `Overall: ${overall.toFixed(2)} → risk level "${riskLevel}", recommended route "${recommendedRoute}"`,
  ];

  return {
    overall,
    confidence,
    riskLevel,
    blastRadius: structural.blastRadius,
    dimensions: { structural: structural.score, semantic, historical },
    reasoning,
    recommendedRoute,
  };
}
