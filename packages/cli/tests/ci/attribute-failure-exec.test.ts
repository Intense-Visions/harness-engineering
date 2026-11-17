import { beforeEach, describe, expect, it, vi } from 'vitest';

type Callback = (
  error: (Error & { code?: unknown }) | null,
  stdout: string,
  stderr: string
) => void;
const execFileMock = vi.fn();
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  // Only `gh` is intercepted; anything else the module graph spawns at load is untouched.
  return {
    ...real,
    execFile: (cmd: string, ...rest: unknown[]) =>
      cmd === 'gh'
        ? execFileMock(cmd, ...rest)
        : (real.execFile as (...a: unknown[]) => unknown)(cmd, ...rest),
  };
});

const { execGh } = await import('../../src/ci/attribute-failure');

/** An execFile stand-in that answers through the node-style callback (last argument). */
function respond(error: (Error & { code?: unknown }) | null, stdout: string, stderr: string) {
  return (...args: unknown[]): void => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') (cb as Callback)(error, stdout, stderr);
  };
}

describe('execGh (real runner, child_process mocked — never spawns gh)', () => {
  beforeEach(() => execFileMock.mockReset());

  it('resolves code 0 with stdout on success, without a shell', async () => {
    execFileMock.mockImplementation(respond(null, '{"ok":true}', ''));
    await expect(execGh(['api', 'repos/a/b'])).resolves.toEqual({
      code: 0,
      stdout: '{"ok":true}',
      stderr: '',
    });
    expect(execFileMock.mock.calls[0]?.[0]).toBe('gh');
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['api', 'repos/a/b']);
  });

  it('carries a numeric exit code and stderr through', async () => {
    execFileMock.mockImplementation(
      respond(Object.assign(new Error('exit 4'), { code: 4 }), '', 'HTTP 404: BlobNotFound')
    );
    await expect(execGh(['run', 'view'])).resolves.toEqual({
      code: 4,
      stdout: '',
      stderr: 'HTTP 404: BlobNotFound',
    });
  });

  it('maps a spawn error (gh missing) to code 1 with the error message', async () => {
    execFileMock.mockImplementation(
      respond(Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }), '', '')
    );
    await expect(execGh(['--version'])).resolves.toEqual({
      code: 1,
      stdout: '',
      stderr: 'spawn gh ENOENT',
    });
  });
});
