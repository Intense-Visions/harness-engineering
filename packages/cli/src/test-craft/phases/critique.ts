/**
 * CRITIQUE phase — invokes the LLM provider per (test, rubric) pair
 * and parses 3-axis findings from the response.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Technical Design → Critique phase).
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { TestRubric } from '../catalog/rubrics/index.js';
import type { ExtractedTest, TestFinding } from '../findings/schema.js';
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import type { SourcePairResult } from '../extract/source-pair.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';

export interface CritiqueInput {
  test: ExtractedTest;
  rubric: TestRubric;
  provider: LlmProvider;
  sourcePair?: SourcePairResult;
}

export async function critiqueOne(input: CritiqueInput): Promise<TestFinding | null> {
  const { test, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, {
    systemPrompt:
      'You are a senior engineer critiquing a single test against a single rubric. ' +
      'Respond ONLY with a fenced JSON block. If the rubric does not apply or the test ' +
      'is fine, return `null` (literally the word null inside the JSON block).',
  });
  const parsed = parseFencedJson(raw);
  if (parsed === null) return null;
  if (typeof parsed !== 'object') return null;

  const tier = parsed.tier as Tier;
  const impact = parsed.impact as Impact;
  const confidence = parsed.confidence as Confidence;
  if (!isTier(tier) || !isImpact(impact) || !isConfidence(confidence)) return null;
  if (typeof parsed.message !== 'string' || parsed.message.length === 0) return null;

  return {
    code: rubric.id,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target: {
      file: test.file,
      line: test.line,
      testName: test.testName,
      nesting: test.nesting,
      framework: test.framework,
    },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

function buildPrompt(input: CritiqueInput): string {
  const { test, rubric, sourcePair } = input;
  const nestingStr = test.nesting.length > 0 ? test.nesting.join(' > ') + ' > ' : '';
  const flags: string[] = [];
  if (test.skipped) flags.push('SKIPPED');
  if (test.only) flags.push('ONLY');
  const flagsStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

  const lines = [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `Framework: ${test.framework}`,
    `File: ${test.file}:${test.line}`,
    `Test: ${nestingStr}${test.testName}${flagsStr}`,
    '',
    'Test body:',
    '```',
    test.body,
    '```',
  ];

  if (sourcePair !== undefined) {
    lines.push('', `Source under test (${sourcePair.file}):`, '```', sourcePair.content, '```');
  }

  lines.push(
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the test is fine, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique with concrete suggested rewrite when possible>" }`'
  );

  return lines.join('\n');
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const match = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(raw);
  const body = match !== null ? match[1]! : raw;
  if (body.trim() === 'null') return null;
  try {
    const parsed = JSON.parse(body);
    if (parsed === null) return null;
    if (typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTier(v: unknown): v is Tier {
  return v === 'foundational' || v === 'polish' || v === 'aspirational';
}
function isImpact(v: unknown): v is Impact {
  return v === 'small' || v === 'medium' || v === 'large';
}
function isConfidence(v: unknown): v is Confidence {
  return v === 'high' || v === 'medium' || v === 'low';
}
