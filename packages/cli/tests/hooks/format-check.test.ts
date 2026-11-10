import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// Imported after the mock declaration is hoisted by vitest.
import { runFormatCheck, detectFormatter } from '../../src/hooks/format-check.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExec = vi.mocked(execFileSync);

/** Build an error shaped like execFileSync's throw. */
function execError(props: {
  status?: number;
  signal?: string;
  code?: string;
  out?: string;
}): Error {
  const err = new Error('exec failed') as Error & Record<string, unknown>;
  if (props.status !== undefined) err.status = props.status;
  if (props.signal !== undefined) err.signal = props.signal;
  if (props.code !== undefined) err.code = props.code;
  err.stdout = props.out ?? '';
  err.stderr = '';
  return err;
}

describe('runFormatCheck', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'format-check-'));
    mockExec.mockReset();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns clean with no detector when no config exists', () => {
    const result = runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd);
    expect(result.status).toBe('clean');
    expect(result.name).toBeNull();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('detectFormatter finds Biome from biome.json', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    expect(detectFormatter(cwd)?.name).toBe('Biome');
  });

  it('returns clean when the detected formatter exits 0', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    mockExec.mockReturnValue('');
    const result = runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd);
    expect(result.status).toBe('clean');
    expect(result.name).toBe('Biome');
  });

  it('classifies a non-zero exit with parseable output as violations', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ status: 1, out: 'src/a.ts:1 format error' });
    });
    const result = runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd);
    expect(result.status).toBe('violations');
    expect(result.output).toContain('format error');
  });

  it('classifies ENOENT (tool missing) as infra-error', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ code: 'ENOENT' });
    });
    expect(runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd).status).toBe('infra-error');
  });

  it('classifies a timeout signal as infra-error', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ signal: 'SIGTERM' });
    });
    expect(runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd).status).toBe('infra-error');
  });

  it('classifies a usage error (no target file) as infra-error, not a violation', () => {
    writeFileSync(join(cwd, '.prettierrc'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ status: 2, out: '[error] Expected at least one target file/dir.' });
    });
    expect(runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd).status).toBe('infra-error');
  });

  it('classifies a non-zero exit with no output as infra-error', () => {
    writeFileSync(join(cwd, 'biome.json'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ status: 1, out: '' });
    });
    expect(runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd).status).toBe('infra-error');
  });

  describe('gofmt path', () => {
    const goInput = { tool_input: { file_path: 'main.go' } };

    it('reports violations when gofmt lists the file', () => {
      mockExec.mockReturnValue('main.go\n');
      const result = runFormatCheck(goInput, cwd);
      expect(result.status).toBe('violations');
      expect(result.name).toBe('gofmt');
      expect(result.output).toBe('main.go');
    });

    it('is clean when gofmt outputs nothing', () => {
      mockExec.mockReturnValue('');
      expect(runFormatCheck(goInput, cwd).status).toBe('clean');
    });

    it('fails open (infra-error) when gofmt is not installed', () => {
      mockExec.mockImplementation(() => {
        throw execError({ code: 'ENOENT' });
      });
      const result = runFormatCheck(goInput, cwd);
      expect(result.status).toBe('infra-error');
      expect(result.reason).toBe('not-installed');
    });

    // #2337: under load a gofmt timeout looked identical to "not installed",
    // so the strict gate failed open on a file with a genuine violation.
    it('classifies a gofmt kill-by-timeout as reason "timeout"', () => {
      mockExec.mockImplementation(() => {
        throw execError({ code: 'ETIMEDOUT', signal: 'SIGTERM' });
      });
      const result = runFormatCheck(goInput, cwd);
      expect(result.status).toBe('infra-error');
      expect(result.reason).toBe('timeout');
    });

    it('honours HARNESS_FORMAT_CHECK_TIMEOUT_MS for the spawn timeout', () => {
      vi.stubEnv('HARNESS_FORMAT_CHECK_TIMEOUT_MS', '1234');
      try {
        mockExec.mockReturnValue('');
        runFormatCheck(goInput, cwd);
        expect(mockExec.mock.calls[0]?.[2]).toMatchObject({ timeout: 1234 });
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  it('classifies a detector kill-by-timeout as reason "timeout"', () => {
    writeFileSync(join(cwd, '.prettierrc'), '{}');
    mockExec.mockImplementation(() => {
      throw execError({ code: 'ETIMEDOUT', signal: 'SIGTERM' });
    });
    const result = runFormatCheck({ tool_input: { file_path: 'a.ts' } }, cwd);
    expect(result.status).toBe('infra-error');
    expect(result.reason).toBe('timeout');
  });
});
