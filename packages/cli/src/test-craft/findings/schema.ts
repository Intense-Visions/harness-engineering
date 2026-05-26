/**
 * TestFinding schema — 3-axis (ADR 0019) finding emitted by test-craft.
 * Imports shared craft axes from packages/cli/src/shared/craft/.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Outputs → TestFinding).
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'playwright' | 'unknown';

export interface TestFinding {
  /** Stable code in TEST-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (no POLISH phase yet). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    line: number;
    /** The test name (first string-literal argument to it/test). */
    testName: string;
    /** Chain of enclosing describe blocks, outermost first. */
    nesting: string[];
    framework: TestFramework;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface TestCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[] };
  counts: {
    filesScanned: number;
    testsExtracted: number;
    testsSkippedOrTodo: number;
    sourcePaired: number;
  };
  frameworksDetected: Record<TestFramework, number>;
  runId: string;
}

export interface TestCraftOutput {
  findings: TestFinding[];
  summary: TestCraftSummary;
}

/**
 * Per-test extraction shape. Consumed by the critique phase uniformly.
 */
export interface ExtractedTest {
  file: string;
  line: number;
  testName: string;
  /** Outermost to innermost describe chain. */
  nesting: string[];
  /** Callback body text (truncated downstream for prompt cost). */
  body: string;
  framework: TestFramework;
  skipped: boolean;
  todo: boolean;
  only: boolean;
}
