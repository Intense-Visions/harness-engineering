// Issue #2475: every language-base template (and `persistToolingConfig`, which
// runs after the template write on every `harness init`) put the `tooling`
// block at the ROOT of harness.config.json. The schema key for that shape is
// `template.tooling` (config/schema.ts), so `loadConfig` stripped it with an
// "ignored unknown key 'tooling'" warning and the declared toolchain was read
// by nothing.
//
// These tests scaffold through the real `runInit` and then read the config the
// way the CLI does — through `HarnessConfigSchema` — so they fail on either
// defect site: the `.hbs` templates or the post-write step.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runInit } from '../../src/commands/init';
import { HarnessConfigSchema } from '../../src/config/schema';
import { collectStrippedKeys } from '../../src/config/stripped-keys';
import { persistToolingConfig } from '../../src/templates/post-write';
import type { ResolvedTemplate } from '../../src/templates/engine';

const tmpDirs: string[] = [];

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function readConfig(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
}

const cases = [
  { language: 'go', framework: undefined, linter: 'golangci-lint' },
  { language: 'java', framework: undefined, linter: 'checkstyle' },
  { language: 'python', framework: undefined, linter: 'ruff' },
  { language: 'rust', framework: undefined, linter: 'clippy' },
  // A framework overlay exercises the overlay-merge branch of persistToolingConfig.
  { language: 'python', framework: 'fastapi', linter: 'ruff' },
] as const;

describe('scaffolded harness.config.json nests tooling under template (#2475)', () => {
  for (const { language, framework, linter } of cases) {
    const label = framework ? `${language}/${framework}` : `${language}-base`;

    it(`${label}: the schema keeps the scaffolded toolchain and drops nothing`, async () => {
      const dir = tmp(`harness-2475-${language}-`);
      const result = await runInit({
        cwd: dir,
        name: `t-${language}`,
        language,
        ...(framework ? { framework } : {}),
      });
      expect(result.ok).toBe(true);

      const raw = readConfig(dir);
      expect(raw, 'tooling must not sit at the config root').not.toHaveProperty('tooling');

      // What every consumer of loadConfig actually sees.
      const parsed = HarnessConfigSchema.parse(raw);
      expect(parsed.template?.tooling?.linter).toBe(linter);
      expect(parsed.template?.tooling).not.toHaveProperty('lockFile');

      expect(collectStrippedKeys(HarnessConfigSchema, raw).map((d) => d.path)).toEqual([]);
    });
  }
});

describe('persistToolingConfig writes template.tooling (#2475)', () => {
  function resolved(tooling: Record<string, string>, overlay?: Record<string, string>) {
    return {
      metadata: { tooling },
      overlayMetadata: overlay ? { tooling: overlay } : undefined,
    } as unknown as ResolvedTemplate;
  }

  it('folds a legacy root-level tooling block into template.tooling', () => {
    const dir = tmp('harness-2475-legacy-');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        template: { language: 'go', version: 1 },
        tooling: { linter: 'golangci-lint', formatter: 'gofmt' },
      })
    );

    persistToolingConfig(dir, resolved({ linter: 'golangci-lint' }), 'gin');

    const raw = readConfig(dir);
    expect(raw).not.toHaveProperty('tooling');
    expect((raw.template as Record<string, unknown>).tooling).toEqual({
      linter: 'golangci-lint',
      formatter: 'gofmt',
    });
  });

  it('lets overlay tooling win over base tooling, and drops lockFile', () => {
    const dir = tmp('harness-2475-overlay-');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        template: {
          language: 'python',
          version: 1,
          tooling: { linter: 'flake8', formatter: 'black' },
        },
      })
    );

    persistToolingConfig(
      dir,
      resolved(
        { linter: 'ruff' },
        { linter: 'ruff', buildTool: 'setuptools', lockFile: 'req.txt' }
      ),
      'fastapi'
    );

    const template = readConfig(dir).template as Record<string, unknown>;
    expect(template.tooling).toEqual({
      linter: 'ruff',
      formatter: 'black',
      buildTool: 'setuptools',
    });
    expect(template.framework).toBe('fastapi');
  });
});
