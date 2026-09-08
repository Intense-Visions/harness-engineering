import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// -----------------------------------------------------------------------------
// telemetry-wizard-cov544b — branch-coverage lift for src/commands/telemetry-wizard.ts.
// Targets the interactive paths the existing suite skips: runTelemetryWizard's TTY
// walk (prompt / promptRaw / isNo), promptIdentity (opt-in vs declined), and
// ensureTelemetryConfigured's interactive branch that writes config. `node:readline`
// is mocked to feed scripted answers with no real stdin.
// -----------------------------------------------------------------------------

const answers: string[] = [];

vi.mock('node:readline', () => ({
  default: {
    createInterface: () => ({
      question: (_q: string, cb: (a: string) => void) => cb(answers.shift() ?? ''),
      close: () => {},
    }),
  },
}));

import { runTelemetryWizard, ensureTelemetryConfigured } from '../../src/commands/telemetry-wizard';

describe('runTelemetryWizard — TTY prompt walk', () => {
  let originalTTY: unknown;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    answers.length = 0;
    originalTTY = process.stdin.isTTY;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
    logSpy.mockRestore();
  });

  function setTTY(v: boolean): void {
    Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
  }

  it('returns null when stdin is not a TTY', async () => {
    setTTY(false);
    expect(await runTelemetryWizard()).toBeNull();
  });

  it('collects telemetry+adoption+identity when the user opts in', async () => {
    setTTY(true);
    // telemetry (Y/n) → '' (default yes); adoption (Y/n) → 'no' (isNo → disabled);
    // identity? (y/N) → 'y'; project/team/alias raw answers.
    answers.push('', 'no', 'y', 'MyProject', 'Platform', 'dev-1');
    const result = await runTelemetryWizard();
    expect(result).not.toBeNull();
    expect(result!.telemetryEnabled).toBe(true);
    expect(result!.adoptionEnabled).toBe(false);
    expect(result!.identity).toEqual({ project: 'MyProject', team: 'Platform', alias: 'dev-1' });
  });

  it('leaves identity empty when the user declines the identity prompt', async () => {
    setTTY(true);
    // telemetry 'n' (disabled), adoption 'y' (enabled), identity 'N' → declined.
    answers.push('n', 'y', 'n');
    const result = await runTelemetryWizard();
    expect(result!.telemetryEnabled).toBe(false);
    expect(result!.adoptionEnabled).toBe(true);
    expect(result!.identity).toEqual({});
  });

  it('drops blank identity fields (only the provided ones are kept)', async () => {
    setTTY(true);
    // opt in to identity, but leave team + alias blank.
    answers.push('y', 'y', 'yes', 'OnlyProject', '', '');
    const result = await runTelemetryWizard();
    expect(result!.identity).toEqual({ project: 'OnlyProject' });
  });
});

describe('ensureTelemetryConfigured — interactive write branch', () => {
  let dir: string;
  let originalTTY: unknown;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    answers.length = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telem-wizard-cov544b-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1 }),
      'utf-8'
    );
    originalTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
    logSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs the wizard, writes config, and reports the configured summary with identity', async () => {
    answers.push('', '', 'y', 'Proj', '', '');
    const result = await ensureTelemetryConfigured(dir);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('Telemetry configured:');
    expect(result.message).toContain('telemetry enabled');
    expect(result.message).toContain('adoption enabled');
    expect(result.message).toContain('identity set');

    const config = JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
    expect(config.telemetry).toEqual({ enabled: true });
    expect(config.adoption).toEqual({ enabled: true });
    const telem = JSON.parse(
      fs.readFileSync(path.join(dir, '.harness', 'telemetry.json'), 'utf-8')
    );
    expect(telem.identity).toEqual({ project: 'Proj' });
  });

  it('omits the identity note when no identity fields are set', async () => {
    answers.push('n', 'n', 'n');
    const result = await ensureTelemetryConfigured(dir);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('telemetry disabled');
    expect(result.message).toContain('adoption disabled');
    expect(result.message).not.toContain('identity set');
  });
});
