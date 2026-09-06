import type { SecretBackend, SecretConfig } from '@harness-engineering/types';
import { EnvSecretBackend } from './env';
import { OnePasswordSecretBackend } from './onepassword';
import { VaultSecretBackend } from './vault';

export { EnvSecretBackend } from './env';
export { OnePasswordSecretBackend } from './onepassword';
export { VaultSecretBackend } from './vault';

/**
 * The value only when it is a non-empty, non-blank string, else `undefined`.
 *
 * A blank value is what an unset environment variable interpolated into JSON, a
 * templated config whose substitution never fired, or a key created to be filled
 * in later all leave behind. Every one of those means "I did not configure this"
 * — the same thing an absent key means. `??` alone cannot hear it, because `''`
 * is not nullish, so a blank would be forwarded as though it were a real vault
 * name or address.
 *
 * Mirrors the `nonEmptyString` guard in `../backends/codex.ts`.
 */
function nonEmptyString(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

export function createSecretBackend(config: SecretConfig): SecretBackend {
  switch (config.backend) {
    case 'env':
      return new EnvSecretBackend();
    case 'onepassword':
      return new OnePasswordSecretBackend({
        vault: nonEmptyString(config.opVault) ?? 'Private',
      });
    case 'vault':
      return new VaultSecretBackend({
        addr: nonEmptyString(config.vaultAddr) ?? 'http://127.0.0.1:8200',
        path: nonEmptyString(config.vaultPath) ?? 'secret/data/harness',
      });
    default: {
      const exhaustive: never = config.backend;
      throw new Error(`Unsupported secret backend: ${String(exhaustive)}`);
    }
  }
}
