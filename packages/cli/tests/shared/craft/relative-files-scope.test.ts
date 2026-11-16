// packages/cli/tests/shared/craft/relative-files-scope.test.ts
//
// A `files` entry relative to the run's project root (`path`) must reach the
// same files an absolute entry does. Seven craft collectors returned the entry
// verbatim and `fs.readFileSync`'d it against `process.cwd()`, so whenever the
// caller's cwd was not the project root (an MCP server started in another
// checkout, a worktree, a review host forwarding `git diff --name-only`) the
// read failed inside a swallowing `catch`, and the run reported
// `status: 'collected'` with ZERO prompts — a clean pass over files it never
// opened. naming-craft and test-craft already resolved against `path`; they are
// the positive controls in this table.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectCodeCraftPrompts } from '../../../src/code-craft/index.js';
import { collectSecurityCraftPrompts } from '../../../src/security-craft/index.js';
import { collectDocsCraftPrompts } from '../../../src/docs-craft/index.js';
import { collectSpecCraftPrompts } from '../../../src/spec-craft/index.js';
import { collectKnowledgeCraftPrompts } from '../../../src/knowledge-craft/index.js';
import { collectCliErgonomicsCraftPrompts } from '../../../src/cli-ergonomics-craft/index.js';
import { collectApiCraftPrompts } from '../../../src/api-craft/index.js';
import { collectNamingCraftPrompts } from '../../../src/naming-craft/index.js';
import { collectTestCraftPrompts } from '../../../src/test-craft/index.js';

const SOURCE = `import { exec } from 'node:child_process';
export function computeTotal(items: { price: number; qty: number }[], cmd: string): number {
  let total = 0;
  for (const item of items) {
    if (item.qty > 0) {
      total += item.price * item.qty;
    }
  }
  exec('ls ' + cmd);
  return total;
}
`;

// Names chosen so that, resolved against the test runner's cwd (packages/cli),
// none of them exists — the relative read can only succeed via `path`.
const FIXTURES: Record<string, string> = {
  'src/zz-relscope-cart.ts': SOURCE,
  'src/cli/commands/zz-relscope-run.ts':
    "export function registerRun(program: any) { program.command('run').option('-x').action(() => {}); }\n",
  'tests/zz-relscope-cart.test.ts':
    "import { it, expect } from 'vitest';\nit('adds', () => { expect(1 + 1).toBe(2); });\n",
  'docs/zz-relscope-guide.md':
    '# Guide\n\nSome prose that explains a thing.\n\n## Usage\n\nRun it.\n',
  'docs/changes/zz-relscope/proposal.md':
    '# Proposal\n\n## Overview\n\nX.\n\n## Success Criteria\n\n1. Y\n',
  'docs/knowledge/zz-relscope/rule.md':
    '---\ntype: business_rule\ndomain: x\n---\n# Rule\n\nAlways do X.\n',
  'zz-relscope-openapi.yaml':
    'openapi: 3.0.0\ninfo: {title: t, version: "1"}\npaths:\n  /users:\n    get:\n      responses:\n        "200": {description: ok}\n',
};

type Collect = (input: never) => Promise<{ status: string; pendingPrompts?: unknown[] }>;

const CASES: ReadonlyArray<[string, Collect, string]> = [
  ['code-craft', collectCodeCraftPrompts as Collect, 'src/zz-relscope-cart.ts'],
  ['security-craft', collectSecurityCraftPrompts as Collect, 'src/zz-relscope-cart.ts'],
  ['docs-craft', collectDocsCraftPrompts as Collect, 'docs/zz-relscope-guide.md'],
  ['spec-craft', collectSpecCraftPrompts as Collect, 'docs/changes/zz-relscope/proposal.md'],
  [
    'knowledge-craft',
    collectKnowledgeCraftPrompts as Collect,
    'docs/knowledge/zz-relscope/rule.md',
  ],
  [
    'cli-ergonomics-craft',
    collectCliErgonomicsCraftPrompts as Collect,
    'src/cli/commands/zz-relscope-run.ts',
  ],
  ['api-craft', collectApiCraftPrompts as Collect, 'zz-relscope-openapi.yaml'],
  // Positive controls: these two already resolved relative entries against `path`.
  ['naming-craft', collectNamingCraftPrompts as Collect, 'src/zz-relscope-cart.ts'],
  ['test-craft', collectTestCraftPrompts as Collect, 'tests/zz-relscope-cart.test.ts'],
];

describe('craft `files` entries relative to `path`', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-relscope-'));
    for (const [rel, body] of Object.entries(FIXTURES)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body, 'utf8');
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the relative fixtures do not resolve from the runner cwd', () => {
    for (const [, , rel] of CASES) {
      expect(fs.existsSync(path.resolve(process.cwd(), rel))).toBe(false);
    }
  });

  it.each(CASES)(
    '%s collects the same prompts for a relative entry as for an absolute one',
    async (_name, collect, rel) => {
      const count = async (file: string): Promise<number> => {
        const out = await collect({ path: root, files: [file], mode: 'in-session' } as never);
        return (out.pendingPrompts ?? []).length;
      };
      const absolute = await count(path.join(root, rel));
      // POSITIVE CONTROL: the absolute form genuinely produces prompts, so the
      // equality below cannot be satisfied by two zeros.
      expect(absolute).toBeGreaterThan(0);
      expect(await count(rel)).toBe(absolute);
    }
  );
});
