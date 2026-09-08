import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

// -----------------------------------------------------------------------------
// validate-cov544b — branch-coverage lift for src/mcp/tools/validate.ts. Targets
// the DEFAULT (non-affected) path's structure + agentsMap check branches that the
// existing tests do not reach: the conventions-present structure walk (pass /
// invalid-with-missing / result-error), the AGENTS.md checks (pass / invalid with
// missingSections + brokenLinks / result-error), the conventions-absent skip, and
// the sanitizePath rejection. `@harness-engineering/core`'s two validators are
// mocked for determinism; the config is a real temp fixture read by the real
// resolveProjectConfig.
// -----------------------------------------------------------------------------

const { validateFileStructureMock, validateAgentsMapMock } = vi.hoisted(() => ({
  validateFileStructureMock: vi.fn(),
  validateAgentsMapMock: vi.fn(),
}));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    validateFileStructure: validateFileStructureMock,
    validateAgentsMap: validateAgentsMapMock,
  };
});

import { handleValidateProject } from '../../../src/mcp/tools/validate';

const conventions = [
  { pattern: 'src/**', required: true, description: 'source', examples: ['src/index.ts'] },
];

function writeConfig(dir: string, extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    join(dir, 'harness.config.json'),
    JSON.stringify({ version: 1, name: 'p', ...extra }),
    'utf-8'
  );
}

describe('handleValidateProject — default-path structure + agentsMap branches', () => {
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(join(os.tmpdir(), 'validate-cov544b-'));
    // Benign defaults: both checks pass.
    validateFileStructureMock.mockResolvedValue({ ok: true, value: { valid: true, missing: [] } });
    validateAgentsMapMock.mockResolvedValue({
      ok: true,
      value: { valid: true, missingSections: [], brokenLinks: [] },
    });
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('passes structure and agentsMap when both validators report valid', async () => {
    writeConfig(dir, { conventions });
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.valid).toBe(true);
    expect(parsed.checks.config).toBe('pass');
    expect(parsed.checks.structure).toBe('pass');
    expect(parsed.checks.agentsMap).toBe('pass');
    expect(parsed.errors).toEqual([]);
  });

  it('reports each missing required file when structure is invalid', async () => {
    validateFileStructureMock.mockResolvedValue({
      ok: true,
      value: { valid: false, missing: ['src/index.ts', 'README.md'] },
    });
    writeConfig(dir, { conventions });
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.checks.structure).toBe('fail');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toContain('Missing required file: src/index.ts');
    expect(parsed.errors).toContain('Missing required file: README.md');
  });

  it('marks structure fail when the structure validator returns an error result', async () => {
    validateFileStructureMock.mockResolvedValue({ ok: false, error: { message: 'walk failed' } });
    writeConfig(dir, { conventions });
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.checks.structure).toBe('fail');
    expect(
      parsed.errors.some((e: string) => e.includes('Structure validation error: walk failed'))
    ).toBe(true);
  });

  it('skips the structure check when conventions are absent', async () => {
    writeConfig(dir); // no conventions array
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.checks.structure).toBe('skipped');
    expect(validateFileStructureMock).not.toHaveBeenCalled();
  });

  it('surfaces AGENTS.md missing sections and broken links', async () => {
    validateAgentsMapMock.mockResolvedValue({
      ok: true,
      value: {
        valid: false,
        missingSections: ['Overview', 'Commands'],
        brokenLinks: ['./gone.md', './missing.md'],
      },
    });
    writeConfig(dir);
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.checks.agentsMap).toBe('fail');
    expect(parsed.valid).toBe(false);
    expect(
      parsed.errors.some((e: string) => e.includes('missing sections: Overview, Commands'))
    ).toBe(true);
    expect(parsed.errors.some((e: string) => e.includes('2 broken link(s)'))).toBe(true);
  });

  it('marks agentsMap fail when its validator returns an error result', async () => {
    validateAgentsMapMock.mockResolvedValue({ ok: false, error: { message: 'agents parse err' } });
    writeConfig(dir);
    const res = await handleValidateProject({ path: dir });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.checks.agentsMap).toBe('fail');
    expect(
      parsed.errors.some((e: string) => e.includes('AGENTS.md validation error: agents parse err'))
    ).toBe(true);
  });

  it('returns an isError response when the path is the filesystem root (sanitizePath)', async () => {
    const res = await handleValidateProject({ path: '/' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Error:');
    expect(res.content[0].text).toContain('filesystem root');
  });
});
