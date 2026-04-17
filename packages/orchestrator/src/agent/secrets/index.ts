import type { SecretBackend, SecretConfig } from '@harness-engineering/types';
import { EnvSecretBackend } from './env';
import { OnePasswordSecretBackend } from './onepassword';
import { VaultSecretBackend } from './vault';

export { EnvSecretBackend } from './env';
export { OnePasswordSecretBackend } from './onepassword';
export { VaultSecretBackend } from './vault';

export function createSecretBackend(config: SecretConfig): SecretBackend {
  switch (config.backend) {
    case 'env':
      return new EnvSecretBackend();
    case 'onepassword':
      return new OnePasswordSecretBackend({ vault: config.opVault ?? 'Private' });
    case 'vault':
      return new VaultSecretBackend({
        addr: config.vaultAddr ?? 'http://127.0.0.1:8200',
        path: config.vaultPath ?? 'secret/data/harness',
      });
    default: {
      const exhaustive: never = config.backend;
      throw new Error(`Unsupported secret backend: ${String(exhaustive)}`);
    }
  }
}
