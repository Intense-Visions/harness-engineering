// WIRED at the product level for #2473 item 1 ("harness check-deps exits 0
// when it fails") and #2073: a real spawned process, the real config loader,
// the real parser and the real `process.exit`. An in-process test with a
// mocked `process.exit` cannot see an exit code lost between the action and
// the process (a swallowed rejection, an outer handler that exits 0).
//
// Gated on the built CLI through the shared ADR 0111 vocabulary, like the
// sibling cleanup-duplication-exit-code suite.
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runHarness, skipUnlessBin } from '../e2e/support';

const VIOLATING = "import { db } from '../infra/db';\nexport const order = db;\n";

function scaffold(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-check-deps-exit-'));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), VIOLATING);
  fs.writeFileSync(
    path.join(root, 'harness.config.json'),
    JSON.stringify({
      version: 1,
      rootDir: '.',
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
      ],
    })
  );
  return root;
}

describe.skipIf(skipUnlessBin)('harness check-deps exit code (spawned CLI)', () => {
  let root: string;

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exits 1 on a layer violation (#2473 item 1)', () => {
    root = scaffold();
    const result = runHarness(['check-deps'], { cwd: root });
    expect(result.stdout).toContain('Layer violation: domain -> infra');
    expect(result.status).toBe(1);
  });

  it('exits non-zero and names the file when a syntax error hides the violation (#2073)', () => {
    root = scaffold();
    fs.appendFileSync(path.join(root, 'src/domain/order.ts'), 'function broken( {\n');
    const result = runHarness(['check-deps'], { cwd: root });
    expect(result.stdout).not.toContain('validation passed');
    expect(result.stdout).toContain('src/domain/order.ts');
    expect(result.status).toBe(3);
  });

  it('exits 0 on a genuinely clean project', () => {
    root = scaffold();
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    const result = runHarness(['check-deps'], { cwd: root });
    expect(result.stdout).toContain('validation passed');
    expect(result.status).toBe(0);
  });
});
