import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectSolutionEnforcements } from './io';

describe('collectSolutionEnforcements', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'prov-io-'));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  async function writeSolution(rel: string, frontmatter: string): Promise<void> {
    const file = path.join(cwd, 'docs', 'solutions', rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `---\n${frontmatter}\n---\n\nbody\n`);
  }

  it('returns an empty array when docs/solutions is absent', async () => {
    expect(await collectSolutionEnforcements(cwd)).toEqual([]);
  });

  it('collects only solutions that declare a non-empty enforces list', async () => {
    await writeSolution(
      'bug-track/logic-errors/with-enforces.md',
      'module: core\nenforces:\n  - STRENGTH-002\n  - arch:no-cross-package-import'
    );
    await writeSolution('bug-track/logic-errors/no-enforces.md', 'module: core');
    await writeSolution('bug-track/logic-errors/empty-enforces.md', 'module: core\nenforces: []');

    const result = await collectSolutionEnforcements(cwd);
    expect(result).toEqual([
      {
        slug: 'bug-track/logic-errors/with-enforces',
        enforces: ['STRENGTH-002', 'arch:no-cross-package-import'],
      },
    ]);
  });

  it('ignores non-string enforces entries', async () => {
    await writeSolution(
      'bug-track/logic-errors/mixed.md',
      'module: core\nenforces:\n  - STRENGTH-001\n  - 42\n  - ""'
    );
    const result = await collectSolutionEnforcements(cwd);
    expect(result).toEqual([{ slug: 'bug-track/logic-errors/mixed', enforces: ['STRENGTH-001'] }]);
  });
});
