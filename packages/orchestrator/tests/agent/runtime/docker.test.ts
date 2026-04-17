import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerRuntime } from '../../../src/agent/runtime/docker';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

import { execFile } from 'node:child_process';

describe('DockerRuntime', () => {
  let runtime: DockerRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime();
  });

  it('has name "docker"', () => {
    expect(runtime.name).toBe('docker');
  });

  describe('healthCheck', () => {
    it('returns Ok when docker info succeeds', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, '24.0.0', '');
        return {} as any;
      });

      const result = await runtime.healthCheck();
      expect(result.ok).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'docker',
        ['info', '--format', '{{.ServerVersion}}'],
        expect.any(Function)
      );
    });

    it('returns Err when docker is not available', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(new Error('command not found'));
        return {} as any;
      });

      const result = await runtime.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('runtime_not_found');
      }
    });
  });

  describe('createContainer', () => {
    it('creates container with correct flags', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, 'abc123def456\n', '');
        return {} as any;
      });

      const result = await runtime.createContainer({
        image: 'node:22-slim',
        workspacePath: '/tmp/workspace',
        readOnly: true,
        user: '1000:1000',
        network: 'host',
        env: { API_KEY: 'secret123' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.containerId).toBe('abc123def456');
        expect(result.value.runtime).toBe('docker');
      }

      const callArgs = mockExecFile.mock.calls[0]![1] as string[];
      expect(callArgs).toContain('create');
      expect(callArgs).toContain('--read-only');
      expect(callArgs).toContain('--user');
      expect(callArgs).toContain('1000:1000');
      expect(callArgs).toContain('--network');
      expect(callArgs).toContain('host');
      expect(callArgs).toContain('node:22-slim');
      // Env var injected
      const envIdx = callArgs.indexOf('--env');
      expect(envIdx).toBeGreaterThan(-1);
      expect(callArgs[envIdx + 1]).toBe('API_KEY=secret123');
      // Workspace bind mount
      expect(callArgs).toContain('-v');
      expect(callArgs).toContain('/tmp/workspace:/workspace');
      expect(callArgs).toContain('-w');
      expect(callArgs).toContain('/workspace');
    });

    it('omits --read-only when readOnly is false', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, 'abc123\n', '');
        return {} as any;
      });

      await runtime.createContainer({
        image: 'node:22-slim',
        workspacePath: '/tmp/workspace',
        readOnly: false,
        user: '1000:1000',
        network: 'host',
        env: {},
      });

      const callArgs = mockExecFile.mock.calls[0]![1] as string[];
      expect(callArgs).not.toContain('--read-only');
    });

    it('returns Err on docker create failure', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(new Error('image not found'));
        return {} as any;
      });

      const result = await runtime.createContainer({
        image: 'nonexistent:latest',
        workspacePath: '/tmp/workspace',
        readOnly: true,
        user: '1000:1000',
        network: 'host',
        env: {},
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('container_create_failed');
      }
    });

    it('includes extra args when provided', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, 'abc123\n', '');
        return {} as any;
      });

      await runtime.createContainer({
        image: 'node:22-slim',
        workspacePath: '/tmp/workspace',
        readOnly: true,
        user: '1000:1000',
        network: 'host',
        env: {},
        extraArgs: ['--memory', '512m'],
      });

      const callArgs = mockExecFile.mock.calls[0]![1] as string[];
      expect(callArgs).toContain('--memory');
      expect(callArgs).toContain('512m');
    });
  });

  describe('removeContainer', () => {
    it('removes container with docker rm -f', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const result = await runtime.removeContainer({
        containerId: 'abc123',
        runtime: 'docker',
      });

      expect(result.ok).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'docker',
        ['rm', '-f', 'abc123'],
        expect.any(Function)
      );
    });

    it('returns Err on removal failure', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(new Error('no such container'));
        return {} as any;
      });

      const result = await runtime.removeContainer({
        containerId: 'nonexistent',
        runtime: 'docker',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('container_remove_failed');
      }
    });
  });
});
