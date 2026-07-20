import { describe, it, expect } from 'vitest';
import { distillGateFailure, truncateGateOutput } from './gate-feedback';

describe('truncateGateOutput', () => {
  it('returns short output verbatim (trimmed)', () => {
    expect(truncateGateOutput('  hello  ', 4000)).toBe('hello');
  });

  it('keeps head + tail with an elision marker when over budget', () => {
    const out = 'A'.repeat(100) + 'MIDDLE' + 'Z'.repeat(100);
    const r = truncateGateOutput(out, 50);
    expect(r).toContain('truncated');
    expect(r.startsWith('A')).toBe(true);
    expect(r.endsWith('Z')).toBe(true);
    expect(r).not.toContain('MIDDLE');
  });
});

describe('distillGateFailure', () => {
  it('returns short output verbatim', () => {
    expect(distillGateFailure('all good', 4000)).toBe('all good');
  });

  it('falls back to head+tail when no failure markers are present', () => {
    const out = 'x'.repeat(9000);
    const r = distillGateFailure(out, 4000);
    expect(r).toContain('truncated'); // truncateGateOutput signature
  });

  // The af6 regression: vitest output where ~25 passing files push the failing
  // tests' assertion diffs into the MIDDLE — a head+tail slice drops exactly the
  // Expected/Received the model needs. The distiller must PRESERVE those.
  it('preserves the failing-test assertion diffs buried under passing-file noise', () => {
    const passingNoise = Array.from(
      { length: 60 },
      (_, i) => ` ✓ tests/rules/passing-${i}.test.ts (10 tests) 5ms`
    ).join('\n');
    const failureDetail = [
      '',
      '⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯',
      '',
      ' FAIL  tests/rules/no-spread-in-variadic.test.ts > {...obj}',
      'AssertionError: expected [] to deeply equal [ { messageId: ... } ]',
      '- Expected',
      '+ Received',
      '  Array [',
      '-   Object { "messageId": "noSpread" },',
      '  ]',
      '',
    ].join('\n');
    const summary = [
      '',
      ' Test Files  1 failed | 24 passed (25)',
      '      Tests  1 failed | 264 passed (265)',
    ].join('\n');
    const full = `RUN vitest\n${passingNoise}\n${failureDetail}\n${summary}`;

    const r = distillGateFailure(full, 2000);
    // The actionable failure detail survives:
    expect(r).toContain('no-spread-in-variadic.test.ts > {...obj}');
    expect(r).toContain('AssertionError');
    expect(r).toContain('- Expected');
    expect(r).toContain('+ Received');
    expect(r).toContain('messageId');
    // The summary tally survives:
    expect(r).toContain('1 failed | 264 passed');
    // The passing noise is dropped:
    expect(r).not.toContain('passing-30.test.ts');
    // And it stayed within budget:
    expect(r.length).toBeLessThanOrEqual(2000);
  });

  it('preserves tsc error lines and drops surrounding noise', () => {
    const noise = Array.from({ length: 200 }, (_, i) => `info: compiled module ${i}`).join('\n');
    const full = `${noise}\nsrc/rules/foo.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'.\n${noise}`;
    const r = distillGateFailure(full, 1500);
    expect(r).toContain('error TS2322');
    expect(r).toContain("Type 'string' is not assignable");
    expect(r).not.toContain('compiled module 150');
  });

  it('keeps the summary even when failure detail overflows the budget', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      [
        ` FAIL test-${i}`,
        `AssertionError: failure number ${i} with a long-ish explanatory message here`,
      ].join('\n')
    ).join('\n');
    const summary = '      Tests  40 failed | 100 passed (140)';
    const r = distillGateFailure(`${many}\n${summary}`, 1200);
    expect(r).toContain('40 failed | 100 passed');
    expect(r).toContain('AssertionError: failure number 0'); // earliest failures kept
    expect(r).toContain('truncated'); // detail was cut
    expect(r.length).toBeLessThanOrEqual(1200 + summary.length);
  });

  it('preserves eslint error rows', () => {
    const noise = Array.from(
      { length: 100 },
      (_, i) => `  ${i}:1  warning  something  some/rule`
    ).join('\n');
    const full = `${noise}\n  12:5  error  Unexpected console statement  no-console\n${noise}`;
    const r = distillGateFailure(full, 800);
    expect(r).toContain('error  Unexpected console statement  no-console');
  });
});
