import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultSecretBackend } from '../../../src/agent/secrets/vault';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

describe('VaultSecretBackend', () => {
  let backend: VaultSecretBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new VaultSecretBackend({
      addr: 'https://vault.example.com',
      path: 'secret/data/myapp',
    });
  });

  it('has name "vault"', () => {
    expect(backend.name).toBe('vault');
  });

  describe('resolveSecrets', () => {
    it('resolves keys via vault kv get CLI', async () => {
      const mockExecFile = vi.mocked(execFile);
      // vault uses execFile(cmd, args, options, cb) — 4 args
      mockExecFile.mockImplementation((...args: any[]) => {
        const cb = args[args.length - 1] as Function;
        cb(
          null,
          JSON.stringify({ data: { data: { API_KEY: 'vault_secret', DB_PASS: 'vault_pass' } } }),
          ''
        );
        return {} as any;
      });

      const result = await backend.resolveSecrets(['API_KEY', 'DB_PASS']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ API_KEY: 'vault_secret', DB_PASS: 'vault_pass' });
      }
    });

    it('returns Err when a requested key is missing from Vault response', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((...args: any[]) => {
        const cb = args[args.length - 1] as Function;
        cb(null, JSON.stringify({ data: { data: { API_KEY: 'value' } } }), '');
        return {} as any;
      });

      const result = await backend.resolveSecrets(['API_KEY', 'MISSING']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('secret_not_found');
        expect(result.error.key).toBe('MISSING');
      }
    });

    it('returns Err when vault CLI fails', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((...args: any[]) => {
        const cb = args[args.length - 1] as Function;
        cb(new Error('permission denied'));
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
    it('returns Ok when vault is available', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((...args: any[]) => {
        const cb = args[args.length - 1] as Function;
        cb(null, 'Vault v1.15.0\n', '');
        return {} as any;
      });

      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when vault is not available', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation((...args: any[]) => {
        const cb = args[args.length - 1] as Function;
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
