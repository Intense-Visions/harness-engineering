import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findFiles } from '../../src/utils/files';

describe('findFiles — default node_modules ignore (#1188)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'findfiles-test-'));
    fs.mkdirSync(path.join(tmp, 'pkg/node_modules/yargs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'pkg/node_modules/yargs/index.ts'), '// vendored');
    fs.mkdirSync(path.join(tmp, 'pkg/src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'pkg/src/a.ts'), '// first-party');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('excludes node_modules by default', async () => {
    const found = await findFiles('pkg/**/*.ts', tmp);
    expect(found.some((f) => f.includes('node_modules'))).toBe(false);
    expect(found.some((f) => f.endsWith('src/a.ts'))).toBe(true);
  });

  it('honors extraIgnore on top of the defaults', async () => {
    const found = await findFiles('pkg/**/*.ts', tmp, ['**/src/**']);
    expect(found).toHaveLength(0);
  });
});
