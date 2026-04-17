import { execFile } from 'node:child_process';
import type { SecretBackend, SecretError, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

export interface VaultConfig {
  addr: string;
  path: string;
}

function vaultExec(args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile('vault', args, { env: { ...process.env, ...env } }, (error, stdout) => {
      if (error) {
        reject(error as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class VaultSecretBackend implements SecretBackend {
  readonly name = 'vault';
  private addr: string;
  private path: string;

  constructor(config: VaultConfig) {
    this.addr = config.addr;
    this.path = config.path;
  }

  async resolveSecrets(keys: string[]): Promise<Result<Record<string, string>, SecretError>> {
    let data: Record<string, string>;
    try {
      const output = await vaultExec(['kv', 'get', '-format=json', this.path], {
        VAULT_ADDR: this.addr,
      });
      const parsed = JSON.parse(output) as { data: { data: Record<string, string> } };
      data = parsed.data.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const category =
        error instanceof SyntaxError ? ('access_denied' as const) : ('access_denied' as const);
      return Err({ category, message: `Failed to read from Vault: ${msg}` });
    }

    const missing = keys.find((k) => !(k in data));
    if (missing) {
      return Err({
        category: 'secret_not_found',
        message: `Secret key '${missing}' not found in Vault path '${this.path}'`,
        key: missing,
      });
    }

    const secrets: Record<string, string> = {};
    for (const key of keys) secrets[key] = data[key]!;
    return Ok(secrets);
  }

  async healthCheck(): Promise<Result<void, SecretError>> {
    try {
      await vaultExec(['version']);
      return Ok(undefined);
    } catch (error) {
      return Err({
        category: 'provider_unavailable',
        message: `Vault CLI is not available: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
