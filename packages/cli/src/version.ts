import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

let resolved: string;
try {
  resolved = (require_('../package.json') as { version?: string }).version ?? '0.0.0';
} catch {
  resolved = '0.0.0';
}

export const CLI_VERSION: string = resolved;
