/**
 * Machine-readable per-test verdict emission for test-craft (issue #914,
 * checkbox 3).
 *
 * test-craft's raw output is a flat list of per-(test, rubric) findings. When
 * that output is only rendered to chat / the MCP text response, downstream
 * tooling (e.g. a test-promotion gate in the canary ecosystem) loses the
 * structured 8-axis findings. This module projects the findings into a stable,
 * per-test verdict document and writes it to a JSON file so the "consume" side
 * has a real seam to read.
 *
 * The projection is a pure function over `TestCraftOutput`; the file write is a
 * thin side-effect on top of it.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md (Outputs).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Tier } from '../shared/craft/findings/axes.js';
import type { TestCraftOutput, TestCraftSummary, TestFinding } from './findings/schema.js';

/** Stable discriminator so a reader can validate it is looking at this document. */
export const TEST_CRAFT_REPORT_SCHEMA = 'harness.test-craft.verdicts' as const;
export const TEST_CRAFT_REPORT_VERSION = 1 as const;

/**
 * Tier severity, most-severe first. `foundational` means the test fails its
 * basic job, so it is the worst tier a per-test verdict can carry.
 */
const TIER_SEVERITY: Record<Tier, number> = {
  foundational: 0,
  polish: 1,
  aspirational: 2,
};

/** The most severe tier among a test's findings (foundational beats polish beats aspirational). */
function worstTier(findings: readonly TestFinding[]): Tier {
  return findings.reduce<Tier>(
    (worst, f) => (TIER_SEVERITY[f.tier] < TIER_SEVERITY[worst] ? f.tier : worst),
    'aspirational'
  );
}

/** A single test's aggregated verdict — the per-test roll-up of its per-rubric findings. */
export interface TestVerdict {
  target: TestFinding['target'];
  /** Most severe tier among this test's findings. */
  worstTier: Tier;
  /** Number of findings rolled into this verdict. */
  findingCount: number;
  /**
   * Machine-readable promotion signal for a downstream test-promotion gate:
   * a `foundational` finding means the test fails its basic job, so it is not
   * promotable. Every other tier is above-floor and does not block promotion.
   */
  promotable: boolean;
  /** The underlying per-rubric findings for this test, preserved verbatim. */
  findings: TestFinding[];
}

/** The emitted document: self-describing header + per-test verdicts + run summary. */
export interface TestCraftReport {
  schema: typeof TEST_CRAFT_REPORT_SCHEMA;
  version: typeof TEST_CRAFT_REPORT_VERSION;
  /** ISO timestamp when the report was built. */
  generatedAt: string;
  /** Correlates with `TestCraftSummary.runId`. */
  runId: string;
  verdicts: TestVerdict[];
  summary: TestCraftSummary;
}

/** Stable key that groups every rubric finding belonging to the same test. */
function verdictKey(target: TestFinding['target']): string {
  return `${target.file}::${target.line}::${target.nesting.join('>')}::${target.testName}`;
}

/**
 * Project a flat findings list into per-test verdicts. Pure — a test with no
 * findings never appears (its absence is the "clean" signal for a consumer);
 * a test with findings gets one verdict rolling up every rubric that fired.
 */
export function toTestVerdicts(output: TestCraftOutput): TestVerdict[] {
  const byTest = new Map<string, TestFinding[]>();
  for (const finding of output.findings) {
    const key = verdictKey(finding.target);
    const list = byTest.get(key);
    if (list) list.push(finding);
    else byTest.set(key, [finding]);
  }

  const verdicts: TestVerdict[] = [];
  for (const findings of byTest.values()) {
    const tier = worstTier(findings);
    verdicts.push({
      target: findings[0]!.target,
      worstTier: tier,
      findingCount: findings.length,
      promotable: tier !== 'foundational',
      findings,
    });
  }
  return verdicts;
}

/** Build the self-describing report document from a test-craft run. */
export function buildTestCraftReport(output: TestCraftOutput): TestCraftReport {
  return {
    schema: TEST_CRAFT_REPORT_SCHEMA,
    version: TEST_CRAFT_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    runId: output.summary.runId,
    verdicts: toTestVerdicts(output),
    summary: output.summary,
  };
}

/**
 * Write the machine-readable per-test verdict report to `filePath`, creating
 * parent directories as needed. Returns the resolved absolute path written.
 */
export async function emitTestCraftReport(
  output: TestCraftOutput,
  filePath: string
): Promise<string> {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(buildTestCraftReport(output), null, 2), 'utf-8');
  return resolved;
}
