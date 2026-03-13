// tests/rules/no-layer-violation.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/no-layer-violation';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('no-layer-violation', rule, {
  valid: [
    // Domain can import from types
    {
      code: `import { User } from '../types/user';`,
      filename: path.join(fixturesDir, 'src/domain/service.ts'),
    },
    // Services can import from domain
    {
      code: `import { processUser } from '../domain/user';`,
      filename: path.join(fixturesDir, 'src/services/auth.ts'),
    },
    // Services can import from types
    {
      code: `import { Config } from '../types/config';`,
      filename: path.join(fixturesDir, 'src/services/config.ts'),
    },
    // API can import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/api/routes.ts'),
    },
    // External imports are always allowed
    {
      code: `import lodash from 'lodash';`,
      filename: path.join(fixturesDir, 'src/types/utils.ts'),
    },
    // No config - rule is no-op
    {
      code: `import anything from './anywhere';`,
      filename: '/no-config/file.ts',
    },
  ],
  invalid: [
    // Types cannot import from domain
    {
      code: `import { handler } from '../domain/handler';`,
      filename: path.join(fixturesDir, 'src/types/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Types cannot import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/types/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Domain cannot import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/domain/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Domain cannot import from api
    {
      code: `import { router } from '../api/routes';`,
      filename: path.join(fixturesDir, 'src/domain/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
  ],
});
