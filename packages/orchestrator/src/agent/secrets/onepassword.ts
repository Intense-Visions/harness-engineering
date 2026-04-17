import { execFile } from 'node:child_process';
import type { SecretBackend, SecretError, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

export interface OnePasswordConfig {
  vault: string;
}

function opExec(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile('op', args, (error, stdout) => {
      if (error) {
        reject(error as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class OnePasswordSecretBackend implements SecretBackend {
  readonly name = 'onepassword';
  private vault: string;

  constructor(config: OnePasswordConfig) {
    this.vault = config.vault;
  }

  async resolveSecrets(keys: string[]): Promise<Result<Record<string, string>, SecretError>> {
    const secrets: Record<string, string> = {};

    for (const key of keys) {
      try {
        const value = await opExec(['read', `op://${this.vault}/${key}/password`]);
        secrets[key] = value;
      } catch (error) {
        return Err({
          category: 'access_denied',
          message: `Failed to read secret '${key}' from 1Password: ${error instanceof Error ? error.message : String(error)}`,
          key,
        });
      }
    }

    return Ok(secrets);
  }

  async healthCheck(): Promise<Result<void, SecretError>> {
    try {
      await opExec(['--version']);
      return Ok(undefined);
    } catch (error) {
      return Err({
        category: 'provider_unavailable',
        message: `1Password CLI is not available: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
