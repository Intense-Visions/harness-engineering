import type { SecretBackend, SecretError, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

export class EnvSecretBackend implements SecretBackend {
  readonly name = 'env';

  async resolveSecrets(keys: string[]): Promise<Result<Record<string, string>, SecretError>> {
    const secrets: Record<string, string> = {};

    for (const key of keys) {
      const value = process.env[key];
      if (value === undefined) {
        return Err({
          category: 'secret_not_found',
          message: `Environment variable '${key}' is not set`,
          key,
        });
      }
      secrets[key] = value;
    }

    return Ok(secrets);
  }

  async healthCheck(): Promise<Result<void, SecretError>> {
    return Ok(undefined);
  }
}
