import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { writeSessionOverride } from '@harness-engineering/core';
import {
  runAutonomyShow,
  formatAutonomy,
  createAutonomyShowCommand,
} from '../../src/commands/autonomy/show';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-show-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});
const deps = () => ({ cwd: () => project, homeDir: home, env: {} });

describe('harness autonomy show', () => {
  it('reports default values and sources', () => {
    const r = runAutonomyShow({}, deps());
    expect(formatAutonomy(r)).toEqual([
      'level: supervised (source: default)',
      'audit: off (source: default)',
    ]);
  });
  it('includes the session override when --session is given', () => {
    fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
    expect(
      writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    expect(runAutonomyShow({ session: 's1' }, deps()).source.level).toBe('session');
    expect(runAutonomyShow({}, deps()).source.level).toBe('default');
  });
  it('prints warnings', () => {
    const r = runAutonomyShow({}, { ...deps(), env: { HARNESS_AUTONOMY: 'yolo' } });
    expect(formatAutonomy(r).some((l) => l.startsWith('warning: '))).toBe(true);
  });
  it('emits JSON under the global --json flag', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command().option('--json').exitOverride();
    program.addCommand(createAutonomyShowCommand(deps()));
    await program.parseAsync(['node', 'harness', '--json', 'show']);
    const printed = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(printed).toMatchObject({ level: 'supervised', source: { level: 'default' } });
  });
});
