/**
 * The secret-backend selection switch (`createSecretBackend`).
 *
 * Each of the three backends already has its own suite next to this one. What
 * had none is the switch that picks between them and — the dangerous half — the
 * credential defaults it substitutes when the caller omits a field.
 *
 * A wrong default does not throw. It reads real secrets from the wrong vault,
 * or points a production run at a developer's loopback Vault, and every layer
 * above reports success. So the defaults are asserted where they are actually
 * observable: the `op://…` reference and the `VAULT_ADDR` the selected backend
 * spawns its CLI with. Asserting only `instanceof` would prove a constructor
 * ran, not what it was configured with, and would keep passing if `'Private'`
 * silently became `'Shared'`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SecretConfig } from '@harness-engineering/types';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';

import {
  createSecretBackend,
  EnvSecretBackend,
  OnePasswordSecretBackend,
  VaultSecretBackend,
} from '../../../src/agent/secrets';

/** One `execFile` invocation, reduced to the parts a credential can hide in. */
interface SpawnedCommand {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
}

/**
 * The commands the backend under test actually spawned.
 *
 * `execFile` is called as `(cmd, args, cb)` by the 1Password backend and
 * `(cmd, args, options, cb)` by the Vault one, so the options object is located
 * positionally rather than by index.
 */
function spawnedCommands(): SpawnedCommand[] {
  const calls = vi.mocked(execFile).mock.calls as unknown as unknown[][];
  return calls.map((call) => {
    const options = call[2];
    const env =
      typeof options === 'object' && options !== null && 'env' in options
        ? ((options as { env?: Record<string, string | undefined> }).env ?? {})
        : {};
    return { command: call[0] as string, args: call[1] as string[], env };
  });
}

/** Make the spawned CLI succeed with `stdout`, so `resolveSecrets` runs to completion. */
function stubTransport(stdout: string): void {
  vi.mocked(execFile).mockImplementation((...callArgs: unknown[]) => {
    const done = callArgs[callArgs.length - 1] as (
      error: Error | null,
      stdout: string,
      stderr: string
    ) => void;
    done(null, stdout, '');
    return {} as never;
  });
}

/** A Vault `kv get -format=json` payload carrying `API_KEY`. */
const VAULT_PAYLOAD = JSON.stringify({ data: { data: { API_KEY: 'resolved' } } });

describe('createSecretBackend — env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the environment-variable backend', () => {
    const backend = createSecretBackend({ backend: 'env', keys: ['API_KEY'] });

    expect(backend).toBeInstanceOf(EnvSecretBackend);
  });

  it('reads from the process environment rather than any external provider', async () => {
    const previous = process.env.HARNESS_TEST_SECRET;
    process.env.HARNESS_TEST_SECRET = 'from-the-environment';
    try {
      const backend = createSecretBackend({ backend: 'env', keys: ['HARNESS_TEST_SECRET'] });

      const result = await backend.resolveSecrets(['HARNESS_TEST_SECRET']);

      expect(result).toEqual({ ok: true, value: { HARNESS_TEST_SECRET: 'from-the-environment' } });
    } finally {
      if (previous === undefined) delete process.env.HARNESS_TEST_SECRET;
      else process.env.HARNESS_TEST_SECRET = previous;
    }
  });

  it('ignores provider credentials that belong to a backend it was not asked for', async () => {
    // A config carrying leftover Vault/1Password fields must not change which
    // backend is selected — the switch keys off `backend` and nothing else.
    // The key list is deliberately non-empty: either provider backend would
    // spawn its CLI to resolve it, so an empty spawn log rules both of them out.
    const backend = createSecretBackend({
      backend: 'env',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
      opVault: 'Engineering',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()).toEqual([]);
  });
});

describe('createSecretBackend — onepassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransport('resolved\n');
  });

  it('selects the 1Password backend', () => {
    const backend = createSecretBackend({ backend: 'onepassword', keys: ['API_KEY'] });

    expect(backend).toBeInstanceOf(OnePasswordSecretBackend);
  });

  it('reads from the 1Password vault the config named', async () => {
    const backend = createSecretBackend({
      backend: 'onepassword',
      keys: ['API_KEY'],
      opVault: 'Engineering',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()).toEqual([
      { command: 'op', args: ['read', 'op://Engineering/API_KEY/password'], env: {} },
    ]);
  });

  it('falls back to the "Private" vault when the config names none', async () => {
    // The whole point of this assertion is the literal vault name: a changed
    // default reads a different set of real secrets without failing anything.
    const backend = createSecretBackend({ backend: 'onepassword', keys: ['API_KEY'] });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual(['read', 'op://Private/API_KEY/password']);
  });

  it('treats a blank vault name as unconfigured rather than forwarding "op://"', async () => {
    // #1883. An empty string is not nullish, so `??` forwarded it and built
    // `op:///API_KEY/password` — a reference with no vault segment at all. The
    // assertion is on the reference rather than on some validation error
    // because the reference is what the operator's secret actually resolves
    // against; a malformed one fails later, naming the lookup instead of the
    // config key that caused it.
    const backend = createSecretBackend({ backend: 'onepassword', keys: ['API_KEY'], opVault: '' });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual(['read', 'op://Private/API_KEY/password']);
  });

  it('treats a whitespace-only vault name as unconfigured', async () => {
    // Whitespace is the shape a partially-substituted template leaves behind,
    // and it is worse than empty: `op://   /API_KEY/password` looks structurally
    // well-formed, so nothing downstream reads it as missing.
    const backend = createSecretBackend({
      backend: 'onepassword',
      keys: ['API_KEY'],
      opVault: '   ',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual(['read', 'op://Private/API_KEY/password']);
  });

  it('still forwards a configured vault name that merely contains spaces', async () => {
    // The blank check must not become a trim of every value: "Shared Team" is a
    // legitimate 1Password vault name and must reach the CLI unaltered.
    const backend = createSecretBackend({
      backend: 'onepassword',
      keys: ['API_KEY'],
      opVault: 'Shared Team',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual(['read', 'op://Shared Team/API_KEY/password']);
  });
});

describe('createSecretBackend — vault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransport(VAULT_PAYLOAD);
  });

  it('selects the HashiCorp Vault backend', () => {
    const backend = createSecretBackend({ backend: 'vault', keys: ['API_KEY'] });

    expect(backend).toBeInstanceOf(VaultSecretBackend);
  });

  it('reads the secret path the config named', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
      vaultPath: 'secret/data/myapp',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual(['kv', 'get', '-format=json', 'secret/data/myapp']);
  });

  it('talks to the Vault server the config named', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
      vaultPath: 'secret/data/myapp',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.env.VAULT_ADDR).toBe('https://vault.example.com');
  });

  it('falls back to the loopback dev server when no address is configured', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultPath: 'secret/data/myapp',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.env.VAULT_ADDR).toBe('http://127.0.0.1:8200');
  });

  it('falls back to the "secret/data/harness" path when none is configured', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual([
      'kv',
      'get',
      '-format=json',
      'secret/data/harness',
    ]);
  });

  it('treats a blank address as unconfigured rather than spawning with VAULT_ADDR=""', async () => {
    // #1883. `??` forwarded the empty string, so the Vault CLI was spawned with
    // an empty VAULT_ADDR — which fails against whatever the CLI falls back to,
    // reporting a connection problem rather than a configuration one.
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: '',
      vaultPath: 'secret/data/myapp',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.env.VAULT_ADDR).toBe('http://127.0.0.1:8200');
  });

  it('treats a whitespace-only address as unconfigured', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: '  ',
      vaultPath: 'secret/data/myapp',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.env.VAULT_ADDR).toBe('http://127.0.0.1:8200');
  });

  it('treats a blank secret path as unconfigured rather than reading path ""', async () => {
    // #1883. An empty path made the spawned argv `kv get -format=json ''`,
    // which reads nothing and reports a missing secret rather than a missing
    // configuration.
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
      vaultPath: '',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual([
      'kv',
      'get',
      '-format=json',
      'secret/data/harness',
    ]);
  });

  it('treats a whitespace-only secret path as unconfigured', async () => {
    const backend = createSecretBackend({
      backend: 'vault',
      keys: ['API_KEY'],
      vaultAddr: 'https://vault.example.com',
      vaultPath: '   ',
    });

    await backend.resolveSecrets(['API_KEY']);

    expect(spawnedCommands()[0]?.args).toEqual([
      'kv',
      'get',
      '-format=json',
      'secret/data/harness',
    ]);
  });
});

describe('createSecretBackend — an unrecognised backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses the config, naming the backend it did not recognise', () => {
    // Reachable from JSON config and `any`-typed boundaries even though the
    // union type forbids it, which is exactly why the switch is exhaustive.
    const config = { backend: 'hsm', keys: ['API_KEY'] } as unknown as SecretConfig;

    expect(() => createSecretBackend(config)).toThrow(/^Unsupported secret backend: hsm$/);
  });

  it('refuses an empty backend name instead of falling back to a default', () => {
    // A falsy backend name is exactly what an `if (!config.backend) return env`
    // fallback would swallow: secrets would resolve from the wrong place and
    // nothing above would look wrong. Matching the message proves the exhaustive
    // branch is what rejected it, not some incidental TypeError.
    const config = { backend: '', keys: ['API_KEY'] } as unknown as SecretConfig;

    expect(() => createSecretBackend(config)).toThrow(/^Unsupported secret backend:/);
  });
});
