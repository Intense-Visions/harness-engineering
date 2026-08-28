import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectStrippedKeys, formatStrippedKeyWarnings } from './stripped-keys';
import { HarnessConfigSchema } from './schema';
import { loadConfig } from './loader';

/**
 * Regression guard for issue #862: harness.config.json is validated with zod
 * schemas that run in strip mode, so unknown / mis-nested keys were silently
 * dropped with no error and no warning (a plausible-but-wrong config became a
 * silent no-op). The loader now emits a non-fatal warning naming each dropped
 * key, while respecting `.passthrough()` sections that intentionally keep extra
 * keys.
 */
describe('collectStrippedKeys — schema-aware dropped-key detection', () => {
  it('reports a mis-nested key (the #838 / #862 trap) by its stripped path', () => {
    // The honored path is entropy.drift.checkApiSignatures; nesting it under
    // entropy.analyze.drift silently dropped the whole `entropy.analyze` block.
    const raw = { version: 1, entropy: { analyze: { drift: { checkApiSignatures: false } } } };
    const dropped = collectStrippedKeys(HarnessConfigSchema, raw);
    expect(dropped.map((d) => d.path)).toContain('entropy.analyze');
  });

  it('does NOT report extra keys under `.passthrough()` sections (security, performance)', () => {
    const raw = {
      version: 1,
      security: { enabled: true, customTuning: { foo: 1 } },
      performance: { arbitraryBudget: true },
    };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('reports nothing for a fully-valid config', () => {
    const raw = {
      version: 1,
      name: 'demo',
      entropy: { autoFix: true, drift: { checkApiSignatures: false } },
      security: { enabled: true },
    };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('offers a near-typo suggestion for a close sibling but not for a wholesale mis-nesting', () => {
    const typo = collectStrippedKeys(HarnessConfigSchema, {
      version: 1,
      securty: { enabled: true },
    });
    expect(typo).toEqual([{ path: 'securty', suggestion: 'security' }]);

    // `entropy.analyze` is not a near-typo of any entropy field → no suggestion.
    const misnested = collectStrippedKeys(HarnessConfigSchema, {
      version: 1,
      entropy: { analyze: {} },
    });
    expect(misnested).toEqual([{ path: 'entropy.analyze' }]);
    expect(misnested[0]).not.toHaveProperty('suggestion');
  });

  // #982: harness.config.json is a shared file; co-tenant tools read their own
  // top-level namespace out of it. Warning on those keys is harmful — deleting
  // the key to silence the warning silently resets the co-tenant's config.
  it('does NOT report a reserved co-tenant namespace at the root (canary)', () => {
    const raw = { version: 1, canary: { guardian: { block: ['diff-coverage'] } } };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('does NOT report a root-level x-* extension namespace', () => {
    const raw = { version: 1, 'x-myteam': { anything: true } };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('still reports a genuinely unknown root key (allow-list stays narrow)', () => {
    const raw = { version: 1, frobnicate: { enabled: true } };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([{ path: 'frobnicate' }]);
  });

  // Recurring adopter pattern: descriptive project metadata declared at the
  // config root — a human `description` and a plural `stack` block. Multiple
  // projects (including co-tenants) independently hoist stack/tooling metadata
  // to the root, so these are now first-class optional keys and must not strip.
  it('does NOT report top-level description and stack (adopter metadata)', () => {
    const raw = {
      version: 1,
      description: 'A mobile + web monorepo',
      stack: {
        languages: ['typescript'],
        frameworks: ['expo', 'react-native', 'nextjs', 'nativewind'],
        buildTools: ['turborepo', 'metro', 'webpack'],
        testRunners: ['jest', 'vitest'],
        packageManager: 'pnpm',
      },
    };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('does NOT report forward-compat extras inside stack (passthrough)', () => {
    // `stack` is descriptive metadata harness does not consume; adopters may add
    // their own facets (orms, clouds, …) without tripping the strip warning.
    const raw = { version: 1, stack: { languages: ['go'], orms: ['gorm'] } };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([]);
  });

  it('still reports a "canary" key that is mis-nested, not a root co-tenant namespace', () => {
    // Only the ROOT is co-tenant space; `canary` under a known section is a real
    // strip (and exactly the kind of mis-nesting the warning exists to catch).
    const raw = { version: 1, entropy: { canary: {} } };
    expect(collectStrippedKeys(HarnessConfigSchema, raw)).toEqual([{ path: 'entropy.canary' }]);
  });

  it('formats a warning line that names the stripped path', () => {
    const lines = formatStrippedKeyWarnings([{ path: 'entropy.analyze' }]);
    expect(lines).toEqual(["⚠ harness.config.json: ignored unknown key 'entropy.analyze'"]);
  });

  it('formats a did-you-mean sibling path when a suggestion is present', () => {
    const lines = formatStrippedKeyWarnings([{ path: 'securty', suggestion: 'security' }]);
    expect(lines[0]).toBe(
      "⚠ harness.config.json: ignored unknown key 'securty' (did you mean 'security'?)"
    );
  });
});

describe('HarnessConfigSchema — description + stack metadata (adopter root keys)', () => {
  it('parses and preserves top-level description and a plural stack block', () => {
    const parsed = HarnessConfigSchema.parse({
      version: 1,
      description: 'A mobile + web monorepo',
      stack: {
        languages: ['typescript'],
        frameworks: ['expo', 'react-native'],
        buildTools: ['turborepo'],
        testRunners: ['jest', 'vitest'],
        packageManager: 'pnpm',
      },
    });
    expect(parsed.description).toBe('A mobile + web monorepo');
    expect(parsed.stack?.packageManager).toBe('pnpm');
    expect(parsed.stack?.frameworks).toEqual(['expo', 'react-native']);
  });
});

describe('loadConfig — non-fatal stripped-key warning wiring (#862)', () => {
  const tmpFiles: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true });
  });

  function writeConfig(obj: unknown): string {
    const p = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cfg-')),
      'harness.config.json'
    );
    fs.writeFileSync(p, JSON.stringify(obj));
    tmpFiles.push(p);
    return p;
  }

  it('warns to stderr for a mis-nested key without failing the load', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const p = writeConfig({
      version: 1,
      entropy: { analyze: { drift: { checkApiSignatures: false } } },
    });

    const result = loadConfig(p);

    expect(result.ok).toBe(true); // load still succeeds — warning is non-fatal
    const output = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain("ignored unknown key 'entropy.analyze'");
  });

  it('emits no warning for a config whose extras live under a passthrough section', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const p = writeConfig({ version: 1, security: { enabled: true, customFoo: { bar: 1 } } });

    const result = loadConfig(p);

    expect(result.ok).toBe(true);
    const output = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(output).not.toContain('ignored unknown key');
  });

  it('emits no warning for a co-tenant namespace block (canary) (#982)', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const p = writeConfig({ version: 1, canary: { guardian: { block: ['diff-coverage'] } } });

    const result = loadConfig(p);

    expect(result.ok).toBe(true);
    const output = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(output).not.toContain('ignored unknown key');
  });
});
