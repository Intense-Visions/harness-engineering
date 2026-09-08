import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// -----------------------------------------------------------------------------
// status-cov544b — branch-coverage lift for src/commands/telemetry/status.ts.
// Drives createStatusCommand end-to-end with the core consent/identity/install-id
// seams mocked. Covers: consent-allowed (identity present + install id) vs denied
// (reason + not-yet-created), the three resolveDisabledReason branches, env
// overrides present, the getOrCreateInstallId throw guard, --json output, and the
// identity-not-configured path.
// -----------------------------------------------------------------------------

const { resolveConsentMock, readIdentityMock, getOrCreateInstallIdMock } = vi.hoisted(() => ({
  resolveConsentMock: vi.fn(),
  readIdentityMock: vi.fn(),
  getOrCreateInstallIdMock: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  resolveConsent: resolveConsentMock,
  readIdentity: readIdentityMock,
  getOrCreateInstallId: getOrCreateInstallIdMock,
}));

import { createStatusCommand } from '../../../src/commands/telemetry/status';
import { logger } from '../../../src/output/logger';

async function run(args: string[] = []): Promise<{ out: string[]; info: string[] }> {
  const out: string[] = [];
  const info: string[] = [];
  const logSpy = vi
    .spyOn(console, 'log')
    .mockImplementation((...a: unknown[]) => out.push(a.map(String).join(' ')));
  const infoSpy = vi
    .spyOn(logger, 'info')
    .mockImplementation((...a: unknown[]) => info.push(a.map(String).join(' ')) as unknown as void);
  try {
    const program = new Command();
    program.addCommand(createStatusCommand());
    await program.parseAsync(['status', ...args], { from: 'user' });
  } finally {
    logSpy.mockRestore();
    infoSpy.mockRestore();
  }
  return { out, info };
}

describe('createStatusCommand', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DO_NOT_TRACK;
    delete process.env.HARNESS_TELEMETRY_OPTOUT;
    readIdentityMock.mockReturnValue({});
    getOrCreateInstallIdMock.mockReturnValue('install-xyz');
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('prints enabled status with identity + install id when consent allows', async () => {
    resolveConsentMock.mockReturnValue({ allowed: true });
    readIdentityMock.mockReturnValue({ project: 'app', team: 'core', alias: 'me' });
    const { info } = await run();
    const joined = info.join('\n');
    expect(joined).toContain('Telemetry: enabled');
    expect(joined).toContain('Install ID: install-xyz');
    expect(joined).toContain('Identity:');
    expect(joined).toContain('app');
    expect(joined).toContain('core');
    expect(readIdentityMock).toHaveBeenCalledOnce();
  });

  it('prints "Identity: not configured" when consent allows but no identity is set', async () => {
    resolveConsentMock.mockReturnValue({ allowed: true });
    readIdentityMock.mockReturnValue({});
    const { info } = await run();
    expect(info.join('\n')).toContain('Identity: not configured');
  });

  it('does not read identity/install id when consent is denied, and shows the reason', async () => {
    process.env.DO_NOT_TRACK = '1';
    resolveConsentMock.mockReturnValue({ allowed: false });
    const { info } = await run();
    const joined = info.join('\n');
    expect(joined).toContain('Telemetry: disabled');
    expect(joined).toContain('Reason:');
    expect(joined).toContain('DO_NOT_TRACK=1');
    expect(joined).toContain('Install ID: not yet created');
    // Privacy contract: no identity/install lookups on a denied consent.
    expect(readIdentityMock).not.toHaveBeenCalled();
    expect(getOrCreateInstallIdMock).not.toHaveBeenCalled();
  });

  it('reports the HARNESS_TELEMETRY_OPTOUT reason', async () => {
    process.env.HARNESS_TELEMETRY_OPTOUT = '1';
    resolveConsentMock.mockReturnValue({ allowed: false });
    const { info } = await run();
    expect(info.join('\n')).toContain('HARNESS_TELEMETRY_OPTOUT=1');
  });

  it('reports the config-disabled reason when no env override is set', async () => {
    resolveConsentMock.mockReturnValue({ allowed: false });
    const { info } = await run();
    expect(info.join('\n')).toContain('telemetry.enabled is false in config');
  });

  it('prints env overrides when present', async () => {
    process.env.DO_NOT_TRACK = '1';
    process.env.HARNESS_TELEMETRY_OPTOUT = 'true';
    resolveConsentMock.mockReturnValue({ allowed: false });
    const { info } = await run();
    const joined = info.join('\n');
    expect(joined).toContain('Env overrides:');
    expect(joined).toContain('DO_NOT_TRACK=1');
    expect(joined).toContain('HARNESS_TELEMETRY_OPTOUT=true');
  });

  it('keeps install id null when getOrCreateInstallId throws', async () => {
    resolveConsentMock.mockReturnValue({ allowed: true });
    getOrCreateInstallIdMock.mockImplementation(() => {
      throw new Error('cannot create .harness');
    });
    const { info } = await run();
    expect(info.join('\n')).toContain('Install ID: not yet created');
  });

  it('emits the full status as JSON under --json', async () => {
    resolveConsentMock.mockReturnValue({ allowed: true });
    readIdentityMock.mockReturnValue({ project: 'app' });
    const { out, info } = await run(['--json']);
    expect(info).toHaveLength(0); // human printer not used
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.consent.allowed).toBe(true);
    expect(parsed.installId).toBe('install-xyz');
    expect(parsed.identity).toEqual({ project: 'app' });
  });
});
