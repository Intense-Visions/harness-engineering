import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveAutonomy } from '../../src/autonomy/resolve';

const norm = (p: string) => p.replaceAll('\\', '/');
const AUTONOMY_SRC = path.join(__dirname, '../../src/autonomy');
/** Extended in Task 9 once override-store.ts / lower-only.ts / session.ts exist. */
const SCANNED = ['resolve.ts', 'schema.ts', 'paths.ts'];

describe('SC5: project config can never set autonomy', () => {
  it('resolves supervised even when the project config says trusted; only the user config is read', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-sc5-'));
    fs.writeFileSync(
      path.join(project, 'harness.config.json'),
      JSON.stringify({ autonomy: { level: 'trusted', audit: { trusted: false } } })
    );
    const reads: string[] = [];
    const readFile = (p: string) => {
      reads.push(norm(p));
      return undefined;
    };
    const userCfg = path.posix.join(norm(project), 'home', '.harness', 'config.json');
    const r = resolveAutonomy({ env: {}, readFile, userConfigPath: userCfg });
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
      'supervised',
      'default',
      false,
      'default',
    ]);
    // Positive control: the reader WAS exercised, on the user-config path and nothing else.
    expect(reads).toEqual([userCfg]);
    expect(reads.some((p) => p.endsWith('harness.config.json'))).toBe(false);
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('positive control: the same trusted document IS honoured from the user-config path', () => {
    const r = resolveAutonomy({
      env: {},
      readFile: () => JSON.stringify({ autonomy: { level: 'trusted' } }),
    });
    expect([r.level, r.source.level]).toEqual(['trusted', 'user-config']);
  });

  it.each(SCANNED)('%s never references the project config file', (file) => {
    const src = fs.readFileSync(path.join(AUTONOMY_SRC, file), 'utf-8');
    expect(src.length).toBeGreaterThan(0); // positive control: the real file was read
    expect(src).not.toMatch(/harness\.config/);
  });
});
