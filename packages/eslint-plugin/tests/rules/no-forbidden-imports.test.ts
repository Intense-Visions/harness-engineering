// tests/rules/no-forbidden-imports.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/no-forbidden-imports';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('no-forbidden-imports', rule, {
  valid: [
    // Allowed import (domain can import types)
    {
      code: `import { User } from '../types/user';`,
      filename: path.join(fixturesDir, 'src/domain/service.ts'),
    },
    // File not matching any 'from' pattern
    {
      code: `import React from 'react';`,
      filename: path.join(fixturesDir, 'src/ui/component.ts'),
    },
    // No config found - rule is no-op
    {
      code: `import anything from 'anywhere';`,
      filename: '/no-config-here/file.ts',
    },
  ],
  invalid: [
    // Services importing react (forbidden)
    {
      code: `import React from 'react';`,
      filename: path.join(fixturesDir, 'src/services/auth.ts'),
      errors: [{ messageId: 'forbiddenImport' }],
    },
    // Services importing from ui (forbidden)
    {
      code: `import { Button } from '../ui/button';`,
      filename: path.join(fixturesDir, 'src/services/user.ts'),
      errors: [{ messageId: 'forbiddenImport' }],
    },
  ],
});
