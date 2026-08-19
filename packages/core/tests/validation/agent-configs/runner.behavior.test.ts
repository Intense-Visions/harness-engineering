import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentConfigFinding,
  AgentConfigValidation,
} from '../../../src/validation/agent-configs/types';

// Mock the two collaborators so we can drive every branch of validateAgentConfigs
// deterministically without touching the filesystem or a real agnix binary.
vi.mock('../../../src/validation/agent-configs/agnix-runner', () => ({
  DEFAULT_AGNIX_TIMEOUT_MS: 30_000,
  isAgnixDisabled: vi.fn(),
  resolveAgnixBinary: vi.fn(),
  runAgnix: vi.fn(),
  parseAgnixOutput: vi.fn(),
}));
vi.mock('../../../src/validation/agent-configs/fallback', () => ({
  runFallbackRules: vi.fn(),
}));

import {
  isAgnixDisabled,
  parseAgnixOutput,
  resolveAgnixBinary,
  runAgnix,
} from '../../../src/validation/agent-configs/agnix-runner';
import { runFallbackRules } from '../../../src/validation/agent-configs/fallback';
import { validateAgentConfigs } from '../../../src/validation/agent-configs/runner';

const isAgnixDisabledMock = vi.mocked(isAgnixDisabled);
const resolveAgnixBinaryMock = vi.mocked(resolveAgnixBinary);
const runAgnixMock = vi.mocked(runAgnix);
const parseAgnixOutputMock = vi.mocked(parseAgnixOutput);
const runFallbackRulesMock = vi.mocked(runFallbackRules);

const warningFinding: AgentConfigFinding = {
  file: 'CLAUDE.md',
  ruleId: 'HARNESS-AC-003',
  severity: 'warning',
  message: 'missing h1',
};
const errorFinding: AgentConfigFinding = {
  file: 'CLAUDE.md',
  ruleId: 'HARNESS-AC-001',
  severity: 'error',
  message: 'empty file',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: agnix enabled, binary found, runs ok, empty parse.
  isAgnixDisabledMock.mockReturnValue(false);
  resolveAgnixBinaryMock.mockReturnValue('/bin/agnix');
  runAgnixMock.mockResolvedValue({ kind: 'ok', code: 0, stdout: '[]' });
  parseAgnixOutputMock.mockReturnValue([]);
  runFallbackRulesMock.mockResolvedValue([]);
});

describe('validateAgentConfigs — fallback triggers', () => {
  it('falls back with env-disabled and never resolves a binary', async () => {
    isAgnixDisabledMock.mockReturnValue(true);
    const result = await validateAgentConfigs('/repo');
    expect(result).toEqual<AgentConfigValidation>({
      engine: 'fallback',
      valid: true,
      fellBackBecause: 'env-disabled',
      issues: [],
    });
    expect(resolveAgnixBinaryMock).not.toHaveBeenCalled();
    expect(runAgnixMock).not.toHaveBeenCalled();
    expect(runFallbackRulesMock).toHaveBeenCalledWith('/repo');
  });

  it('falls back with binary-not-found when no binary resolves', async () => {
    resolveAgnixBinaryMock.mockReturnValue(null);
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('binary-not-found');
    expect(runAgnixMock).not.toHaveBeenCalled();
  });

  it('falls back with tool-timeout when agnix times out', async () => {
    runAgnixMock.mockResolvedValue({ kind: 'timeout' });
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('tool-timeout');
  });

  it('falls back with tool-failure on a spawn-error', async () => {
    runAgnixMock.mockResolvedValue({ kind: 'spawn-error', stderr: 'ENOENT' });
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('tool-failure');
  });

  it('falls back with tool-failure on a non-zero tool exit', async () => {
    runAgnixMock.mockResolvedValue({ kind: 'tool-failure', code: 2, stderr: 'boom' });
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('tool-failure');
  });

  it('falls back with tool-parse-error when JSON output cannot be parsed', async () => {
    runAgnixMock.mockResolvedValue({ kind: 'ok', code: 0, stdout: 'garbage' });
    parseAgnixOutputMock.mockReturnValue(null);
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('tool-parse-error');
  });
});

describe('validateAgentConfigs — agnix success path', () => {
  it('returns engine=agnix, valid=true and passes issues through unchanged (no fellBackBecause)', async () => {
    parseAgnixOutputMock.mockReturnValue([warningFinding]);
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('agnix');
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([warningFinding]);
    expect(result.fellBackBecause).toBeUndefined();
    expect(runFallbackRulesMock).not.toHaveBeenCalled();
  });

  it('valid=false when any error-severity finding is present', async () => {
    parseAgnixOutputMock.mockReturnValue([warningFinding, errorFinding]);
    const result = await validateAgentConfigs('/repo');
    expect(result.engine).toBe('agnix');
    expect(result.valid).toBe(false);
  });

  it('parses the exact stdout the tool produced', async () => {
    runAgnixMock.mockResolvedValue({ kind: 'ok', code: 1, stdout: 'RAW-JSON' });
    parseAgnixOutputMock.mockReturnValue([]);
    await validateAgentConfigs('/repo');
    expect(parseAgnixOutputMock).toHaveBeenCalledWith('RAW-JSON', '/repo');
  });
});

describe('validateAgentConfigs — strict promotion', () => {
  it('promotes warnings to errors on the agnix path and flips valid to false', async () => {
    parseAgnixOutputMock.mockReturnValue([warningFinding]);
    const result = await validateAgentConfigs('/repo', { strict: true });
    expect(result.engine).toBe('agnix');
    expect(result.valid).toBe(false);
    expect(result.issues.every((i) => i.severity === 'error')).toBe(true);
    // Non-mutating: original finding object is untouched.
    expect(warningFinding.severity).toBe('warning');
  });

  it('leaves non-warning findings unchanged when promoting', async () => {
    const infoFinding: AgentConfigFinding = { ...warningFinding, severity: 'info' };
    parseAgnixOutputMock.mockReturnValue([infoFinding]);
    const result = await validateAgentConfigs('/repo', { strict: true });
    expect(result.issues[0]?.severity).toBe('info');
    expect(result.valid).toBe(true);
  });

  it('promotes warnings to errors on the fallback path too', async () => {
    isAgnixDisabledMock.mockReturnValue(true);
    runFallbackRulesMock.mockResolvedValue([warningFinding]);
    const result = await validateAgentConfigs('/repo', { strict: true });
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('env-disabled');
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.severity).toBe('error');
  });
});

describe('validateAgentConfigs — option plumbing', () => {
  it('forwards options.agnixBin to resolveAgnixBinary', async () => {
    await validateAgentConfigs('/repo', { agnixBin: '/custom/agnix' });
    expect(resolveAgnixBinaryMock).toHaveBeenCalledWith('/custom/agnix');
  });

  it('forwards a custom agnixTimeoutMs to runAgnix', async () => {
    await validateAgentConfigs('/repo', { agnixTimeoutMs: 1234 });
    expect(runAgnixMock).toHaveBeenCalledWith('/repo', false, '/bin/agnix', 1234);
  });

  it('uses DEFAULT_AGNIX_TIMEOUT_MS (30_000) when agnixTimeoutMs is omitted', async () => {
    await validateAgentConfigs('/repo');
    expect(runAgnixMock).toHaveBeenCalledWith('/repo', false, '/bin/agnix', 30_000);
  });

  it('passes strict=true through to runAgnix', async () => {
    await validateAgentConfigs('/repo', { strict: true });
    expect(runAgnixMock).toHaveBeenCalledWith('/repo', true, '/bin/agnix', 30_000);
  });

  it('defaults strict to false when unspecified', async () => {
    await validateAgentConfigs('/repo');
    const strictArg = runAgnixMock.mock.calls[0]?.[1];
    expect(strictArg).toBe(false);
  });
});
