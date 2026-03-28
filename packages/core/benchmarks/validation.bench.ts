import { bench, describe } from 'vitest';
import { z } from 'zod';
import { validateConfig } from '../src/validation/config';
import { validateCommitMessage } from '../src/validation/commit-message';

// --- Fixtures ---

const appConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  port: z.number(),
  database: z.object({
    host: z.string(),
    port: z.number(),
    name: z.string(),
  }),
  features: z.array(z.string()),
});

const validConfig = {
  name: 'my-app',
  version: '1.0.0',
  port: 3000,
  database: { host: 'localhost', port: 5432, name: 'mydb' },
  features: ['auth', 'logging', 'metrics'],
};

const invalidConfig = {
  name: 123,
  version: null,
  port: 'not-a-number',
};

const validCommitMsg = 'feat(core): add validation benchmarks';
const invalidCommitMsg = 'this is not a conventional commit';

// --- Benchmarks ---

describe('validateConfig', () => {
  bench('valid config object', () => {
    validateConfig(validConfig, appConfigSchema);
  });

  bench('invalid config object', () => {
    validateConfig(invalidConfig, appConfigSchema);
  });
});

describe('validateCommitMessage', () => {
  bench('valid conventional commit', () => {
    validateCommitMessage(validCommitMsg, 'conventional');
  });

  bench('invalid commit message', () => {
    validateCommitMessage(invalidCommitMsg, 'conventional');
  });
});
