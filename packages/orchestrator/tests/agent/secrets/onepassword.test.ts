import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnePasswordSecretBackend } from '../../../src/agent/secrets/onepassword';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

describe('OnePasswordSecretBackend', () => {
  let backend: OnePasswordSecretBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new OnePasswordSecretBackend({ vault: 'MyVault' });
  });

  it('has name "onepassword"', () => {
    expect(backend.name).toBe('onepassword');
  });

  describe('resolveSecrets', () => {
    it('resolves keys via op read CLI', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        const args = _args as string[];
        const ref = args[1]!;
        if (ref.includes('API_KEY')) {
          cb(null, 'secret_value\n', '');
        } else {
          cb(null, 'other_value\n', '');
        }
        return {} as any;
      });

      const result = await backend.resolveSecrets(['API_KEY', 'DB_PASS']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.API_KEY).toBeDefined();
        expect(result.value.DB_PASS).toBeDefined();
      }

      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('returns Err when op CLI fails', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(new Error('not signed in'));
        return {} as any;
      });

      const result = await backend.resolveSecrets(['API_KEY']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('access_denied');
      }
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when op is available', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(null, '2.0.0\n', '');
        return {} as any;
      });

      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when op is not available', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((_cmd: any, _args: any, cb: any) => {
        cb(new Error('command not found'));
        return {} as any;
      });

      const result = await backend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('provider_unavailable');
      }
    });
  });
});
