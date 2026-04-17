import { describe, expect, it } from 'vitest';
import { parseAgnixOutput } from '../../../src/validation/agent-configs/agnix-runner';

describe('parseAgnixOutput', () => {
  it('returns [] on empty stdout', () => {
    expect(parseAgnixOutput('', '/repo')).toEqual([]);
  });

  it('returns null on unparseable JSON', () => {
    expect(parseAgnixOutput('{ nope', '/repo')).toBeNull();
  });

  it('normalizes an array of diagnostics into AgentConfigFinding shape', () => {
    const stdout = JSON.stringify([
      {
        file: '/repo/CLAUDE.md',
        line: 42,
        rule_id: 'CC-MEM-006',
        severity: 'error',
        message: 'something wrong',
        suggestion: 'fix it',
      },
    ]);
    const parsed = parseAgnixOutput(stdout, '/repo');
    expect(parsed).toEqual([
      {
        file: 'CLAUDE.md',
        line: 42,
        ruleId: 'CC-MEM-006',
        severity: 'error',
        message: 'something wrong',
        suggestion: 'fix it',
      },
    ]);
  });

  it('accepts envelope objects with `diagnostics` field', () => {
    const stdout = JSON.stringify({
      diagnostics: [
        { path: '/repo/hooks.js', rule: 'CC-HOOK-001', severity: 'warning', message: 'm' },
      ],
    });
    const parsed = parseAgnixOutput(stdout, '/repo');
    expect(parsed?.[0]).toMatchObject({
      file: 'hooks.js',
      ruleId: 'CC-HOOK-001',
      severity: 'warning',
    });
  });

  it('maps unknown severity to warning and preserves info/error classes', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule_id: 'X-1', severity: 'fatal', message: 'm' },
      { file: '/repo/b', rule_id: 'X-2', severity: 'hint', message: 'm' },
      { file: '/repo/c', rule_id: 'X-3', message: 'm' },
    ]);
    const parsed = parseAgnixOutput(stdout, '/repo');
    expect(parsed?.[0]?.severity).toBe('error');
    expect(parsed?.[1]?.severity).toBe('info');
    expect(parsed?.[2]?.severity).toBe('warning');
  });
});
