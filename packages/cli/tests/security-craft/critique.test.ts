import { describe, it, expect } from 'vitest';
import { critiqueOne } from '../../src/security-craft/phases/critique';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';
import { trustBoundaryRespectedRubric } from '../../src/security-craft/catalog/rubrics/trust-boundary-respected';
import { failClosedNotOpenRubric } from '../../src/security-craft/catalog/rubrics/fail-closed-not-open';
import type { SecuritySignal } from '../../src/security-craft/findings/schema';

const signal: SecuritySignal = {
  kind: 'privileged-op',
  marker: 'child_process.exec',
  line: 5,
};

const source = `import { exec } from 'child_process';

export function run(req, res) {
  const cmd = req.body.cmd;
  exec(cmd, (err, stdout) => res.json({ stdout }));
}
`;

describe('critiqueOne (security-craft)', () => {
  it('parses a fenced-JSON finding and emits a SecurityFinding', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'SEC-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"command injection via req.body.cmd"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/run.ts',
      source,
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.code).toBe('SEC-R001');
    expect(finding!.tier).toBe('foundational');
    expect(finding!.impact).toBe('large');
    expect(finding!.confidence).toBe('high');
    expect(finding!.target.file).toBe('/tmp/run.ts');
    expect(finding!.target.signal).toBe('child_process.exec');
    expect(finding!.target.line).toBe(5);
    expect(finding!.cite.rubricId).toBe('SEC-R001');
    expect(finding!.derived.priority).toBeGreaterThan(0);
  });

  it('returns null when LLM responds with `null` (rubric not applicable)', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'SEC-R001', response: '```json\nnull\n```' },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/run.ts',
      source,
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when LLM response is malformed', async () => {
    const provider = new MockLlmProvider([{ promptIncludes: 'SEC-R006', response: 'no JSON' }]);
    const finding = await critiqueOne({
      file: '/tmp/run.ts',
      source,
      signal,
      rubric: failClosedNotOpenRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('returns null when axes are invalid', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'SEC-R001',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"sky-high","message":"x"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/tmp/run.ts',
      source,
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('default mock provider returns confidence: low (honest per ADR 0019)', async () => {
    // MockLlmProvider default response emits confidence: 'low'; verify the
    // pipeline preserves that honestly rather than inflating to high.
    const provider = new MockLlmProvider([]);
    const finding = await critiqueOne({
      file: '/tmp/run.ts',
      source,
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.confidence).toBe('low');
  });
});
