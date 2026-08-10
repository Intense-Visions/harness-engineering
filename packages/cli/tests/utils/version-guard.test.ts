import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GUARDED_COMMANDS,
  evaluateVersionGuard,
  resolveExpectedVersion,
  findProjectRoot,
  type ExpectedVersion,
} from '../../src/utils/version-guard';

const pin = (range: string): ExpectedVersion => ({
  range,
  source: 'config',
  origin: 'harness.config.json',
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'version-guard-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(contents: unknown, at = dir): void {
  writeFileSync(join(at, 'harness.config.json'), JSON.stringify(contents));
}

function writePackage(contents: unknown, at = dir): void {
  writeFileSync(join(at, 'package.json'), JSON.stringify(contents));
}

describe('evaluateVersionGuard — satisfied ranges are silent', () => {
  // Criterion 1: a satisfied range produces no output and no gating.
  it.each([
    ['11.1.1', '>=11'],
    ['12.0.0', '>=11'],
    ['11.1.1', '^11.1.1'],
    ['11.9.9', '11.x'],
  ])('%s satisfies %s', (cliVersion, range) => {
    const result = evaluateVersionGuard(cliVersion, pin(range));
    expect(result.status).toBe('ok');
    expect(result.message).toBe('');
  });
});

describe('evaluateVersionGuard — unknown never gates', () => {
  // Criterion 2: nothing to compare against means silence, not a nag.
  it('reports unknown when no expected version is resolvable', () => {
    const result = evaluateVersionGuard('11.1.1', undefined);
    expect(result.status).toBe('unknown');
    expect(result.message).toBe('');
  });

  // Criterion 7c: the version.ts resolution-failure sentinel must never gate.
  // Against a >=11 pin this is a delta of 11, so without the guard any
  // packaging regression would become a blanket refusal of every scan command.
  it('reports unknown for the 0.0.0 sentinel rather than refusing', () => {
    const result = evaluateVersionGuard('0.0.0', pin('>=11'));
    expect(result.status).toBe('unknown');
  });

  it('reports unknown when the CLI version is not valid semver', () => {
    expect(evaluateVersionGuard('not-a-version', pin('>=11')).status).toBe('unknown');
  });

  // Criterion 7b: minVersion() returns null for an unsatisfiable range.
  it('reports unknown for an unsatisfiable range instead of throwing', () => {
    expect(() => evaluateVersionGuard('11.1.1', pin('>=11 <10'))).not.toThrow();
    expect(evaluateVersionGuard('11.1.1', pin('>=11 <10')).status).toBe('unknown');
  });
});

describe('evaluateVersionGuard — the severity ladder', () => {
  // Criterion 3: this is the reported incident — a v1 CLI in a v11 workspace.
  it('refuses when the CLI is 10 majors behind', () => {
    const result = evaluateVersionGuard('1.13.1', pin('>=11'), { commandPath: 'check-security' });
    expect(result.status).toBe('refuse');
    expect(result.majorDelta).toBe(10);
  });

  it('refuses at a delta of exactly 2', () => {
    expect(evaluateVersionGuard('9.0.0', pin('>=11')).status).toBe('refuse');
  });

  // Criterion 4: one major behind is the normal state of a repo mid-upgrade.
  // Refusing there would turn a safety net into an outage.
  it('warns rather than refuses at a delta of exactly 1', () => {
    const result = evaluateVersionGuard('10.4.0', pin('>=11'));
    expect(result.status).toBe('warn');
    expect(result.majorDelta).toBe(1);
  });

  it('warns for an unsatisfied pin within the same major', () => {
    const result = evaluateVersionGuard('11.1.1', pin('^11.2.0'));
    expect(result.status).toBe('warn');
    expect(result.majorDelta).toBe(0);
  });

  // A newer CLI reports rules the workspace has not adopted (noise), which is
  // milder than an older one re-reporting resolved findings (falsehood).
  it('warns rather than refuses when the CLI is ahead of the pinned major', () => {
    const result = evaluateVersionGuard('14.0.0', pin('=11.1.1'));
    expect(result.status).toBe('warn');
    expect(result.majorDelta).toBe(-3);
  });

  it('names both versions and the running binary in a refusal', () => {
    const result = evaluateVersionGuard('1.13.1', pin('>=11'), { commandPath: 'check-security' });
    expect(result.message).toContain('1.13.1');
    expect(result.message).toContain('>=11');
    expect(result.message).toContain('check-security');
    expect(result.message).toContain('Running binary:');
    expect(result.message).toContain('which -a harness');
  });
});

describe('evaluateVersionGuard — the escape hatch', () => {
  // Criterion 5: the hatch buys a working command, not a quiet one. Silencing
  // the notice would let one exported variable restore the original silent
  // failure permanently.
  it('downgrades a refusal to a warning but still reports the mismatch', () => {
    const result = evaluateVersionGuard('1.13.1', pin('>=11'), {
      bypass: true,
      commandPath: 'check-security',
    });
    expect(result.status).toBe('warn');
    expect(result.bypassed).toBe(true);
    expect(result.message).toContain('1.13.1');
    expect(result.message).toContain('HARNESS_NO_VERSION_GUARD');
  });

  it('does not mark an ordinary warning as bypassed', () => {
    const result = evaluateVersionGuard('10.0.0', pin('>=11'), { bypass: true });
    expect(result.status).toBe('warn');
    expect(result.bypassed).toBe(false);
  });
});

describe('resolveExpectedVersion', () => {
  it('reads toolchain.cliVersion from harness.config.json', () => {
    writeConfig({ version: 1, toolchain: { cliVersion: '>=11' } });
    expect(resolveExpectedVersion(dir)).toMatchObject({ range: '>=11', source: 'config' });
  });

  it('falls back to a package.json dependency range', () => {
    writeConfig({ version: 1 });
    writePackage({ devDependencies: { '@harness-engineering/cli': '^11.1.1' } });
    expect(resolveExpectedVersion(dir)).toMatchObject({
      range: '^11.1.1',
      source: 'dependency',
    });
  });

  it('prefers dependencies when devDependencies has no entry', () => {
    writePackage({ dependencies: { '@harness-engineering/cli': '^9.0.0' } });
    expect(resolveExpectedVersion(dir)?.range).toBe('^9.0.0');
  });

  // Criterion 9: an explicit pin is a statement of intent; a dependency range
  // is an artifact of package management.
  it('prefers the config pin over the package.json range', () => {
    writeConfig({ version: 1, toolchain: { cliVersion: '>=11' } });
    writePackage({ devDependencies: { '@harness-engineering/cli': '^9.0.0' } });
    expect(resolveExpectedVersion(dir)).toMatchObject({ range: '>=11', source: 'config' });
  });

  // Criterion 10: coercing these would manufacture false mismatches in
  // monorepos, and minVersion() throws on all of them.
  it.each(['workspace:*', 'file:../cli', 'link:../cli', 'git+https://x/y.git', 'latest', '*'])(
    'ignores the non-semver specifier %s',
    (spec) => {
      writePackage({ devDependencies: { '@harness-engineering/cli': spec } });
      expect(resolveExpectedVersion(dir)).toBeUndefined();
    }
  );

  it('ignores an invalid config pin rather than throwing', () => {
    writeConfig({ version: 1, toolchain: { cliVersion: 'latest' } });
    expect(() => resolveExpectedVersion(dir)).not.toThrow();
    expect(resolveExpectedVersion(dir)).toBeUndefined();
  });

  it('returns undefined when neither source exists', () => {
    expect(resolveExpectedVersion(dir)).toBeUndefined();
  });

  it('swallows malformed JSON in either file', () => {
    writeFileSync(join(dir, 'harness.config.json'), '{ not json');
    writeFileSync(join(dir, 'package.json'), '{ also not json');
    expect(() => resolveExpectedVersion(dir)).not.toThrow();
    expect(resolveExpectedVersion(dir)).toBeUndefined();
  });

  // Criterion 7d: the guard must read the same config the command scans with.
  it('honors an explicit config path override', () => {
    writeConfig({ version: 1, toolchain: { cliVersion: '>=11' } });
    const other = join(dir, 'other.config.json');
    writeFileSync(other, JSON.stringify({ version: 1, toolchain: { cliVersion: '>=20' } }));
    expect(resolveExpectedVersion(dir, other)?.range).toBe('>=20');
  });

  it('names the overridden file as the origin, not harness.config.json', () => {
    const other = join(dir, 'other.config.json');
    writeFileSync(other, JSON.stringify({ version: 1, toolchain: { cliVersion: '>=20' } }));
    expect(resolveExpectedVersion(dir, other)?.origin).toBe(other);
  });

  it('names harness.config.json as the origin when no override is given', () => {
    writeConfig({ version: 1, toolchain: { cliVersion: '>=11' } });
    expect(resolveExpectedVersion(dir)?.origin).toBe('harness.config.json');
  });
});

describe('findProjectRoot', () => {
  it('walks up to the directory holding harness.config.json', () => {
    writeConfig({ version: 1 });
    const nested = join(dir, 'packages', 'thing', 'src');
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(dir);
  });

  it('falls back to the start directory when no config is found', () => {
    const nested = join(dir, 'nowhere');
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(nested);
  });
});

describe('GUARDED_COMMANDS', () => {
  it('gates the findings-producing commands', () => {
    for (const name of [
      'check-security',
      'check-docs',
      'check-deps',
      'check-perf',
      'check-harness-strength',
      'cleanup',
      'validate',
      'review-ci',
    ]) {
      expect(GUARDED_COMMANDS.has(name)).toBe(true);
    }
  });

  // A guard that blocks its own remedy is a trap: these are exactly the
  // commands you reach for when your toolchain is wrong.
  it.each(['doctor', 'update', 'setup', 'init'])('does not gate %s', (name) => {
    expect(GUARDED_COMMANDS.has(name)).toBe(false);
  });

  // Nested commands share leaf names with gated ones; they must not collide.
  it.each(['skill.validate', 'linter.validate', 'perf.update', 'graph.scan'])(
    'does not gate the nested command %s',
    (path) => {
      expect(GUARDED_COMMANDS.has(path)).toBe(false);
    }
  );
});
