import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { confirmYesNo } from '../../src/output/prompt';
import { runAutonomySet, createAutonomySetCommand } from '../../src/commands/autonomy/set';

/**
 * I5: EOF / close on the confirm prompt (stdin closed, Ctrl-D, a piped empty input) must
 * resolve as DECLINED. Previously the readline question never settled on close, so the
 * process drained its event loop and exited 0 with no message and no decision.
 */
const io = (input: string | null) => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  stdout.resume();
  if (input === null) stdin.end();
  else stdin.end(input);
  return { input: stdin, output: stdout };
};

describe('confirmYesNo', () => {
  it('resolves false on EOF with no answer', async () => {
    await expect(confirmYesNo('Raise? ', io(null))).resolves.toBe(false);
  });
  it.each([
    ['y\n', true],
    ['YES\n', true],
    ['n\n', false],
    ['\n', false],
    ['maybe\n', false],
  ])('answer %j → %s (positive control for the EOF case)', async (answer, expected) => {
    await expect(confirmYesNo('Raise? ', io(answer))).resolves.toBe(expected);
  });
});

describe('harness autonomy set on a closed stdin', () => {
  let tmp: string;
  let home: string;
  let project: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-eof-'));
    home = path.join(tmp, 'home');
    project = path.join(tmp, 'project');
    fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
  });
  afterEach(() => {
    process.exitCode = undefined;
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const deps = () => ({
    cwd: () => project,
    homeDir: home,
    env: {},
    isInteractive: () => true,
    confirm: (q: string) => confirmYesNo(q, io(null)),
  });

  it('a raise on EOF is declined with an Aborted message and no write', async () => {
    const out = await runAutonomySet('trusted', { session: 's1' }, deps());
    expect(out).toMatchObject({ status: 'refused', reason: 'declined' });
    expect(out.status === 'refused' && out.message).toMatch(/^Aborted/);
    expect(fs.existsSync(path.join(home, '.harness', 'session-overrides'))).toBe(false);
  });

  it('the command exits 1 on EOF', async () => {
    const cmd = createAutonomySetCommand(deps());
    cmd.exitOverride();
    await cmd.parseAsync(['trusted', '--session', 's1'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
});
