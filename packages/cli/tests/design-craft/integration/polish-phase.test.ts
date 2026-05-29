// packages/cli/tests/design-craft/integration/polish-phase.test.ts
//
// Phase 2 integration tests for the design-craft POLISH phase.
//
// Coverage:
//   1. Happy path — MockLlmProvider returns `applies: true` for a target
//      whose source matches the spring-physics pattern's applicableTo
//      filter (cubic-bezier substring). The phase emits one CraftFinding
//      with `phase: 'polish'`, `code: 'CRAFT-P001'`, and both `before` and
//      `after` populated from the pattern.
//   2. Pre-filter — when the source contains nothing matching the pattern's
//      `applicableTo[]` rules, the LLM is NEVER called (cost-cheap fast-
//      mode contract).
//   3. Non-application — when the LLM returns `applies: false`, no finding
//      is emitted (POLISH suggestions are not noise).
//   4. End-to-end via MCP — phase selector wires POLISH correctly through
//      the handler.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runPolish, patternIsPlausible } from '../../../src/design-craft/phases/polish.js';
import type { PolishTarget } from '../../../src/design-craft/phases/polish.js';
import { springPhysicsPattern } from '../../../src/design-craft/catalog/patterns/spring-physics.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

const CUBIC_BEZIER_SOURCE = `
// Fixture: a Card with classic cubic-bezier transition.
export function Card() {
  return (
    <div
      style={{ transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      Hover me
    </div>
  );
}
`;

const NO_MOTION_SOURCE = `
export function Label({ children }) {
  return <span>{children}</span>;
}
`;

const APPLIES_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      applies: true,
      tier: 'polish',
      impact: 'medium',
      confidence: 'medium',
      message:
        'Card uses cubic-bezier easing on transform. Replacing with spring physics would make the hover feel more physical and reversible.',
    },
    null,
    2
  ),
  '```',
].join('\n');

const NOT_APPLIES_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      applies: false,
      tier: 'polish',
      impact: 'small',
      confidence: 'high',
      message: 'Pattern does not apply — no motion code present.',
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft POLISH phase', () => {
  const target: PolishTarget = {
    file: 'fixtures/Card.tsx',
    component: 'Card',
    source: CUBIC_BEZIER_SOURCE,
  };

  it('emits a CRAFT-P001 finding with before/after when the pattern applies', async () => {
    const provider = new MockLlmProvider([{ promptIncludes: 'Card', response: APPLIES_RESPONSE }]);

    const findings = await runPolish({
      targets: [target],
      patterns: [springPhysicsPattern],
      provider,
    });

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.code).toBe('CRAFT-P001');
    expect(finding.phase).toBe('polish');
    expect(finding.tier).toBe('polish');
    expect(finding.impact).toBe('medium');
    expect(finding.confidence).toBe('medium');
    expect(finding.before).toBe(springPhysicsPattern.before);
    expect(finding.after).toBe(springPhysicsPattern.after);
    expect(finding.cite.rubricOrPatternId).toBe('pattern-spring-physics');
    expect(finding.target).toEqual({ file: 'fixtures/Card.tsx', component: 'Card' });
    expect(finding.derived.priority).toBeGreaterThan(0);
  });

  it('skips the LLM call when applicability pre-filter rules out the pattern', async () => {
    const provider = new MockLlmProvider();
    const callSpy = vi.spyOn(provider, 'callText');

    const noMotionTarget: PolishTarget = {
      file: 'fixtures/Label.tsx',
      component: 'Label',
      source: NO_MOTION_SOURCE,
    };

    const findings = await runPolish({
      targets: [noMotionTarget],
      patterns: [springPhysicsPattern],
      provider,
    });

    expect(findings).toEqual([]);
    expect(callSpy).not.toHaveBeenCalled();
  });

  it('drops a finding when the LLM judges the pattern does not apply', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'Card', response: NOT_APPLIES_RESPONSE },
    ]);

    const findings = await runPolish({
      targets: [target],
      patterns: [springPhysicsPattern],
      provider,
    });

    expect(findings).toEqual([]);
  });

  it('patternIsPlausible matches the substring rules', () => {
    expect(patternIsPlausible(CUBIC_BEZIER_SOURCE, springPhysicsPattern)).toBe(true);
    expect(patternIsPlausible(NO_MOTION_SOURCE, springPhysicsPattern)).toBe(false);
  });
});

describe('design-craft MCP handler — POLISH phase wiring', () => {
  it('runs POLISH end-to-end when requested', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-polish-'));
    const fixturePath = path.join(tmpDir, 'Card.tsx');
    fs.writeFileSync(fixturePath, CUBIC_BEZIER_SOURCE, 'utf8');

    const provider = new MockLlmProvider([{ promptIncludes: 'Card', response: APPLIES_RESPONSE }]);

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'fast',
      phases: ['polish'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: provider,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      findings: Array<{
        code: string;
        phase: string;
        before?: string;
        after?: string;
      }>;
      summary: {
        phaseRun: string[];
        catalog: { patternsApplied: string[] };
      };
    };

    expect(payload.findings).toHaveLength(1);
    expect(payload.findings[0].code).toBe('CRAFT-P001');
    expect(payload.findings[0].phase).toBe('polish');
    expect(payload.findings[0].before).toContain('cubic-bezier');
    expect(payload.findings[0].after).toContain('spring');
    expect(payload.summary.phaseRun).toEqual(['polish']);
    // patternsApplied lists the catalog items the phase considered (loaded
    // into runPolish), not the ones that emitted findings. Widened in the
    // Phase 2 catalog increment to include skeleton-content-matched (P002)
    // and stagger-timing (P003); only spring-physics (P001) actually fires
    // for the cubic-bezier fixture because the prefilter rules out the
    // other two.
    expect(payload.summary.catalog.patternsApplied).toEqual([
      'pattern-spring-physics',
      'pattern-skeleton-content-matched',
      'pattern-stagger-timing',
    ]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
