import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateAgentsMap } from '../../../context/agents-map';
import { runAgentsMdRules } from './rule-agents-md';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../context/agents-map', () => ({
  validateAgentsMap: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockValidateAgentsMap = vi.mocked(validateAgentsMap);

const CWD = '/repo';
const EXPECTED_AGENTS_PATH = join(CWD, 'AGENTS.md');
const DEFAULT_SUGGESTION = 'Run `harness init` to regenerate AGENTS.md';

/** Build a minimal `Ok` Result as returned by `validateAgentsMap`. */
function okResult() {
  return { ok: true as const, value: {} } as unknown as Awaited<
    ReturnType<typeof validateAgentsMap>
  >;
}

/** Build a minimal `Err` Result carrying a ContextError. */
function errResult(message: string, suggestions?: string[]) {
  return {
    ok: false as const,
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: {},
      suggestions: suggestions ?? [],
    },
  } as unknown as Awaited<ReturnType<typeof validateAgentsMap>>;
}

describe('runAgentsMdRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no findings and skips validation when AGENTS.md is absent', async () => {
    mockExistsSync.mockReturnValue(false);

    const findings = await runAgentsMdRules(CWD);

    expect(findings).toEqual([]);
    expect(mockValidateAgentsMap).not.toHaveBeenCalled();
  });

  it('checks for AGENTS.md at the cwd-joined path', async () => {
    mockExistsSync.mockReturnValue(false);

    await runAgentsMdRules(CWD);

    expect(mockExistsSync).toHaveBeenCalledWith(EXPECTED_AGENTS_PATH);
  });

  it('returns no findings when the existing AGENTS.md validates', async () => {
    mockExistsSync.mockReturnValue(true);
    mockValidateAgentsMap.mockResolvedValue(okResult());

    const findings = await runAgentsMdRules(CWD);

    expect(mockValidateAgentsMap).toHaveBeenCalledWith(EXPECTED_AGENTS_PATH);
    expect(findings).toEqual([]);
  });

  it('emits a HARNESS-AC-050 error finding mapping the validation error and first suggestion', async () => {
    const message = 'Missing required section: ## Build';
    const primarySuggestion = 'Add a `## Build` section';
    mockExistsSync.mockReturnValue(true);
    mockValidateAgentsMap.mockResolvedValue(
      errResult(message, [primarySuggestion, 'a secondary suggestion'])
    );

    const findings = await runAgentsMdRules(CWD);

    expect(findings).toEqual([
      {
        file: 'AGENTS.md',
        ruleId: 'HARNESS-AC-050',
        severity: 'error',
        message,
        suggestion: primarySuggestion,
      },
    ]);
  });

  it('falls back to the default suggestion when the error carries none', async () => {
    const message = 'AGENTS.md is malformed';
    mockExistsSync.mockReturnValue(true);
    mockValidateAgentsMap.mockResolvedValue(errResult(message, []));

    const [finding] = await runAgentsMdRules(CWD);

    expect(finding!.suggestion).toBe(DEFAULT_SUGGESTION);
    expect(finding!.message).toBe(message);
  });
});
