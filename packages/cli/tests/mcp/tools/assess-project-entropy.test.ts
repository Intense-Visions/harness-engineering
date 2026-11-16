import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleAssessProject } from '../../../src/mcp/tools/assess-project';

// End-to-end over the REAL detect_entropy handler (nothing mocked): the
// entropy check must count what detect_entropy actually reports. It once
// summed `drift.staleReferences` / `drift.missingTargets` /
// `deadCode.unusedExports`, none of which exist on the report, so dead
// exports, dead files and documentation drift counted 0 and the check
// passed over a project full of them (#2550).

const dirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assess-entropy-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

const PKG = JSON.stringify({ name: 'fx', version: '1.0.0', main: 'src/index.ts' });

async function entropyCheck(dir: string) {
  const res = await handleAssessProject({ path: dir, checks: ['entropy'] });
  const parsed = JSON.parse(res.content[0]!.text) as {
    checks: Array<{ name: string; passed: boolean; issueCount: number; topIssue?: string }>;
  };
  return parsed.checks.find((c) => c.name === 'entropy')!;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('assess_project entropy check against the real detect_entropy report (#2550)', () => {
  it('counts dead exports and dead files, and fails the check', async () => {
    const dir = fixture({
      'package.json': PKG,
      'src/index.ts': "import { used } from './util';\nexport const main = () => used();\n",
      'src/util.ts': 'export const used = () => 1;\nexport const neverImported = () => 2;\n',
      'src/orphan.ts': 'export const orphan = 3;\n',
    });
    const c = await entropyCheck(dir);
    // neverImported (dead export) + orphan (dead export) + orphan.ts (dead file)
    expect(c.issueCount).toBe(3);
    expect(c.passed).toBe(false);
    expect(c.topIssue).toMatch(/^Dead (export|file)/);
  }, 60_000);

  it('positive control: a project with no entropy counts 0 and passes', async () => {
    const dir = fixture({
      'package.json': PKG,
      'src/index.ts': "import { used } from './util';\nexport const main = () => used();\n",
      'src/util.ts': 'export const used = () => 1;\n',
    });
    const c = await entropyCheck(dir);
    expect(c.issueCount).toBe(0);
    expect(c.passed).toBe(true);
    expect(c.topIssue).toBeUndefined();
  }, 60_000);
});
