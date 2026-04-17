import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnvSecretBackend } from '../../../src/agent/secrets/env';

describe('EnvSecretBackend', () => {
  let backend: EnvSecretBackend;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SECRET_A: 'value_a', SECRET_B: 'value_b' };
    backend = new EnvSecretBackend();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('has name "env"', () => {
    expect(backend.name).toBe('env');
  });

  describe('resolveSecrets', () => {
    it('resolves keys from process.env', async () => {
      const result = await backend.resolveSecrets(['SECRET_A', 'SECRET_B']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ SECRET_A: 'value_a', SECRET_B: 'value_b' });
      }
    });

    it('returns Err when a key is missing', async () => {
      const result = await backend.resolveSecrets(['SECRET_A', 'MISSING_KEY']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('secret_not_found');
        expect(result.error.key).toBe('MISSING_KEY');
      }
    });

    it('returns empty record for empty keys', async () => {
      const result = await backend.resolveSecrets([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({});
      }
    });
  });

  describe('healthCheck', () => {
    it('always returns Ok', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });
  });
});
