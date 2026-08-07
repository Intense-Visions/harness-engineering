import { describe, it, expect } from 'vitest';
import {
  buildSubprocessEnv,
  isEnvKeyAllowed,
  SUBPROCESS_ENV_ALLOW_VAR,
  SUBPROCESS_ENV_PASSTHROUGH_VAR,
} from './subprocess-env';

describe('buildSubprocessEnv (subprocess air-gap)', () => {
  it('(a) passes well-known-safe base vars, provider creds, and harness/session prefixes through', () => {
    const source: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      HOME: '/home/agent',
      SHELL: '/bin/zsh',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      TMPDIR: '/tmp',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      OPENAI_API_KEY: 'sk-openai-xxx',
      SOMEPROVIDER_API_KEY: 'sk-generic-xxx',
      HARNESS_ANALYSIS_BASE_URL: 'http://localhost:1234/v1',
      HARNESS_SESSION_ID: 'sess-1',
      CLAUDE_CONFIG_DIR: '/home/agent/.claude',
      GH_TOKEN: 'gho_xxx',
      HTTPS_PROXY: 'http://proxy:8080',
    };
    const { env } = buildSubprocessEnv(source);
    // Every allowlisted key survives with its exact value.
    for (const key of Object.keys(source)) {
      expect(env[key]).toBe(source[key]);
    }
  });

  it('(b) strips arbitrary unrelated secrets that match no allow rule', () => {
    const source: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      DATABASE_URL: 'postgres://user:pw@host/db',
      STRIPE_SECRET_KEY: 'sk_live_xxx',
      NPM_TOKEN: 'npm_xxx',
      INTERNAL_SERVICE_PASSWORD: 'hunter2',
    };
    const { env, stripped, enforced } = buildSubprocessEnv(source);
    expect(enforced).toBe(true);
    // Allowlisted survive.
    expect(env.PATH).toBe('/usr/bin');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
    // Unrelated secrets are gone from the spawned env.
    expect(env).not.toHaveProperty('DATABASE_URL');
    expect(env).not.toHaveProperty('STRIPE_SECRET_KEY');
    expect(env).not.toHaveProperty('NPM_TOKEN');
    expect(env).not.toHaveProperty('INTERNAL_SERVICE_PASSWORD');
    // ...and recorded (names only) for the audit trail.
    expect(stripped).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'STRIPE_SECRET_KEY',
        'NPM_TOKEN',
        'INTERNAL_SERVICE_PASSWORD',
      ])
    );
    expect(stripped).not.toContain('PATH');
    expect(stripped).not.toContain('ANTHROPIC_API_KEY');
  });

  it('extends the allowlist via the extraAllow option', () => {
    const source: NodeJS.ProcessEnv = { PATH: '/usr/bin', MY_CUSTOM_SECRET: 'v' };
    const { env, stripped } = buildSubprocessEnv(source, { extraAllow: ['MY_CUSTOM_SECRET'] });
    expect(env.MY_CUSTOM_SECRET).toBe('v');
    expect(stripped).not.toContain('MY_CUSTOM_SECRET');
  });

  it('extends the allowlist via the HARNESS_SUBPROCESS_ENV_ALLOW escape hatch', () => {
    const source: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      SPECIAL_ONE: 'a',
      SPECIAL_TWO: 'b',
      [SUBPROCESS_ENV_ALLOW_VAR]: 'SPECIAL_ONE, SPECIAL_TWO',
    };
    const { env } = buildSubprocessEnv(source);
    expect(env.SPECIAL_ONE).toBe('a');
    expect(env.SPECIAL_TWO).toBe('b');
  });

  it('advisory passthrough mode leaves the env intact but still reports what would be stripped', () => {
    const source: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      DATABASE_URL: 'postgres://x',
      [SUBPROCESS_ENV_PASSTHROUGH_VAR]: '1',
    };
    const { env, stripped, enforced } = buildSubprocessEnv(source);
    expect(enforced).toBe(false);
    expect(env.DATABASE_URL).toBe('postgres://x'); // not actually stripped
    expect(stripped).toContain('DATABASE_URL'); // but flagged as would-be-stripped
  });

  it('drops undefined-valued keys without listing them as stripped', () => {
    const source: NodeJS.ProcessEnv = { PATH: '/usr/bin', MAYBE: undefined };
    const { env, stripped } = buildSubprocessEnv(source);
    expect(env).not.toHaveProperty('MAYBE');
    expect(stripped).not.toContain('MAYBE');
  });

  it('isEnvKeyAllowed recognizes base, prefix, suffix and extra rules', () => {
    const extra = new Set<string>(['CUSTOM']);
    expect(isEnvKeyAllowed('PATH', extra)).toBe(true);
    expect(isEnvKeyAllowed('HARNESS_X', extra)).toBe(true);
    expect(isEnvKeyAllowed('FOO_API_KEY', extra)).toBe(true);
    expect(isEnvKeyAllowed('CUSTOM', extra)).toBe(true);
    expect(isEnvKeyAllowed('DATABASE_URL', extra)).toBe(false);
  });

  it('(windows) forwards the OS-plumbing vars a subprocess needs to spawn', () => {
    // Regression: the allowlist was POSIX-only, so on Windows every subprocess
    // spawned with a stripped env crashed/hung — node.exe cannot initialize
    // without SystemRoot, and executables cannot resolve without PATHEXT/ComSpec.
    const source: NodeJS.ProcessEnv = {
      // Canonical Windows casings straight from process.env on win32.
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      SystemDrive: 'C:',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      windir: 'C:\\Windows',
      TEMP: 'C:\\Users\\a\\AppData\\Local\\Temp',
      USERPROFILE: 'C:\\Users\\a',
      APPDATA: 'C:\\Users\\a\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local',
      NUMBER_OF_PROCESSORS: '8',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      // An unrelated secret must still be dropped.
      DATABASE_URL: 'postgres://user:pw@host/db',
    };
    const { env, stripped } = buildSubprocessEnv(source);
    for (const key of Object.keys(source)) {
      if (key === 'DATABASE_URL') continue;
      expect(env[key]).toBe(source[key]);
    }
    expect(env).not.toHaveProperty('DATABASE_URL');
    expect(stripped).toEqual(['DATABASE_URL']);
  });

  it('(windows) matches allowlist entries case-insensitively', () => {
    const extra = new Set<string>();
    // OS supplies mixed casing; the allowlist stores canonical/upper forms.
    expect(isEnvKeyAllowed('Path', extra)).toBe(true);
    expect(isEnvKeyAllowed('SystemRoot', extra)).toBe(true);
    expect(isEnvKeyAllowed('Temp', extra)).toBe(true);
    expect(isEnvKeyAllowed('ComSpec', extra)).toBe(true);
    // A case-insensitive extraAllow name resolves regardless of OS casing.
    expect(isEnvKeyAllowed('My_Custom', new Set(['MY_CUSTOM']))).toBe(true);
  });
});
