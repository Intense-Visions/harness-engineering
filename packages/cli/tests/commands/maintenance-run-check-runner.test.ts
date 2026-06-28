import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createCheckRunner, resolveHarnessSpawn } from '../../src/commands/maintenance-run';

/**
 * A controlled fake "harness" entry. Behaves like the real binary enough to
 * exercise the three branches the runner must distinguish:
 *   - <fake> check-arch  → stdout "45 issues", exit 1  (ran, found issues)
 *   - <fake> clean       → stdout "Validation passed", exit 0 (clean run)
 *   - <fake> unknowncmd  → stderr "unknown command", exit 1 (could not run)
 */
const FAKE_HARNESS = `
const [sub] = process.argv.slice(2);
if (sub === 'check-arch') { process.stdout.write('Validation failed (45 issues)\\n'); process.exit(1); }
if (sub === 'clean') { process.stdout.write('Validation passed\\n'); process.exit(0); }
if (sub === 'unknowncmd') { process.stderr.write("error: unknown command 'unknowncmd'\\n"); process.exit(1); }
process.exit(0);
`;

let dir: string;
let fakeEntry: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-checkrunner-'));
  fakeEntry = path.join(dir, 'fake-harness.js');
  fs.writeFileSync(fakeEntry, FAKE_HARNESS, 'utf-8');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveHarnessSpawn', () => {
  it('runs a bare subcommand through the harness entry binary', () => {
    const spawn = resolveHarnessSpawn(['check-arch'], '/path/to/harness.js');
    expect(spawn.file).toBe(process.execPath);
    expect(spawn.args).toEqual(['/path/to/harness.js', 'check-arch']);
  });

  it('does not double-prefix a command that already starts with harness', () => {
    const spawn = resolveHarnessSpawn(['harness', 'sync-main', '--json'], '/path/to/harness.js');
    expect(spawn.args).toEqual(['/path/to/harness.js', 'sync-main', '--json']);
  });
});

describe('createCheckRunner', () => {
  it('a check that RAN and found issues → real findings, not executionFailed', async () => {
    const runner = createCheckRunner(fakeEntry);
    const r = await runner.run(['check-arch'], dir);
    expect(r.findings).toBe(45);
    expect(r.executionFailed).toBe(false);
    expect(r.passed).toBe(false);
  });

  it('a clean run (exit 0, no count) → 0 findings, passed, not failed', async () => {
    const runner = createCheckRunner(fakeEntry);
    const r = await runner.run(['clean'], dir);
    expect(r.findings).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.executionFailed).toBe(false);
  });

  it('an unknown subcommand (exit 1, no count) → executionFailed, 0 findings (not 1)', async () => {
    const runner = createCheckRunner(fakeEntry);
    const r = await runner.run(['unknowncmd'], dir);
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0);
  });

  it('a spawn failure (missing entry binary) → executionFailed, 0 findings', async () => {
    const runner = createCheckRunner(path.join(dir, 'does-not-exist.js'));
    const r = await runner.run(['check-arch'], dir);
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0);
  });
});
