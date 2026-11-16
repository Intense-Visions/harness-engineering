// Every adopter config template must parse against the schema that validates a
// real `harness.config.json` (docs/changes/clumping/proposal.md, Phase 6:
// "the adopter `.hbs` template (never prettier-formatted) … adopter template
// validates").
//
// This gate did not exist. `template-content.test.ts` checks that
// `basic/harness.config.json.hbs` EXISTS and that each `template.json` parses;
// nothing checked that the config a template scaffolds is a config the CLI will
// accept. A template with a mistyped or mis-nested key therefore produced a
// project whose very first `harness` command printed "ignored unknown key" —
// or, for a wrongly-typed field, "Invalid config" — with every test green.
//
// It is also the only mechanical guard on the `.hbs` files themselves, which
// are deliberately EXEMPT from prettier (prettier mangles JSON-in-hbs), so they
// get no formatter-level syntax check at all.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HarnessConfigSchema } from '../../src/config/schema';
import { collectStrippedKeys } from '../../src/config/stripped-keys';
import { deepMergeJson } from '../../src/templates/merger';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

/**
 * Render an `.hbs` config by substituting the handlebars expressions `init`
 * supplies.
 *
 * A deliberately dumb substitution rather than a handlebars dependency: these
 * files use simple `{{name}}` interpolation only, and the point of the test is
 * that the JSON around those holes is valid. Anything more expressive showing
 * up here should fail loudly on the JSON.parse below rather than be papered
 * over by a fuller renderer.
 */
function render(source: string): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) =>
    key === 'projectName' ? 'adopter-project' : `value-for-${key}`
  );
}

const configTemplates = fs
  .readdirSync(TEMPLATES_DIR)
  .filter((d) => fs.statSync(path.join(TEMPLATES_DIR, d)).isDirectory())
  .map((d) => [d, path.join(TEMPLATES_DIR, d, 'harness.config.json.hbs')] as const)
  .filter(([, file]) => fs.existsSync(file));

/**
 * The config an adopter actually gets from a template.
 *
 * A framework overlay's `harness.config.json.hbs` is a FRAGMENT — it declares
 * only the entry files the overlay renders (#2630) — and the engine deep-merges
 * it over the config of the template it lands on. Validate that merged result;
 * the fragment alone is not a config anyone scaffolds. A TypeScript overlay can
 * land on any level, so it is checked over `basic`, the smallest.
 */
function scaffoldedConfig(name: string, file: string): unknown {
  const own = JSON.parse(render(fs.readFileSync(file, 'utf-8'))) as Record<string, unknown>;
  const meta = JSON.parse(
    fs.readFileSync(path.join(TEMPLATES_DIR, name, 'template.json'), 'utf-8')
  ) as { framework?: string; language?: string; extends?: string };
  if (!meta.framework) return own;
  const host = meta.extends ?? (meta.language === 'typescript' ? 'basic' : `${meta.language}-base`);
  const hostFile = path.join(TEMPLATES_DIR, host, 'harness.config.json.hbs');
  return deepMergeJson(JSON.parse(render(fs.readFileSync(hostFile, 'utf-8'))), own);
}

describe('adopter config templates validate', () => {
  it('there are templates to check — a zero-length loop would pass vacuously', () => {
    expect(configTemplates.length).toBeGreaterThan(4);
  });

  for (const [name, file] of configTemplates) {
    it(`${name}/harness.config.json.hbs renders to a valid harness config`, () => {
      let parsed: unknown;
      expect(() => {
        parsed = scaffoldedConfig(name, file);
      }, `${name} does not render to valid JSON`).not.toThrow();

      const result = HarnessConfigSchema.safeParse(parsed);
      expect(
        result.success,
        result.success
          ? ''
          : `${name}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      ).toBe(true);
    });

    it(`${name}/harness.config.json.hbs declares no key the schema silently drops`, () => {
      // The stripped-key warner (issue #862) exists because zod discards an
      // unknown or mis-nested key with no signal. A template that ships such a
      // key scaffolds a project whose first command prints a warning about a
      // setting the adopter never typed.
      const parsed = scaffoldedConfig(name, file);
      const dropped = collectStrippedKeys(HarnessConfigSchema, parsed).map((d) => d.path);
      //
      // Issue #2475 was this exact defect: all four language-base templates
      // shipped a root-level `tooling` block (schema key: `template.tooling`).
      // It was recorded in a per-template baseline here until fixed; the
      // baseline is gone, so any dropped key in any template now fails.
      expect(dropped).toEqual([]);
    });
  }

  it('POSITIVE CONTROL: the schema REJECTS a config the templates would have to avoid', () => {
    // Without this, every assertion above is satisfied by a schema that accepts
    // anything — `.passthrough()` is used on several blocks, so that is a live
    // possibility rather than a theoretical one.
    expect(HarnessConfigSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(
      HarnessConfigSchema.safeParse({ version: 1, clumping: { maxPerClump: 'twelve' } }).success
    ).toBe(false);
  });

  it('POSITIVE CONTROL: the stripped-key walker SEES a bad key in this shape', () => {
    expect(
      collectStrippedKeys(HarnessConfigSchema, { version: 1, clumping: { maxPerClamp: 9 } })
    ).not.toEqual([]);
  });
});

describe('the clumping block ships in the templates that carry tuning blocks', () => {
  /**
   * `advanced` and `load-bearing-minimum` already declare architecture and
   * performance thresholds; the language-base and starter templates do not, and
   * an adopter at that level has no `-fleet` run to tune. The block is optional
   * everywhere, so its absence costs the others nothing.
   */
  const CARRIERS = ['advanced', 'load-bearing-minimum'];

  for (const name of CARRIERS) {
    it(`${name} declares a clumping block the schema accepts`, () => {
      const file = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
      const parsed = JSON.parse(render(fs.readFileSync(file, 'utf-8'))) as {
        clumping?: Record<string, unknown>;
      };
      expect(parsed.clumping).toBeDefined();
      expect(HarnessConfigSchema.safeParse(parsed).success).toBe(true);
    });

    it(`${name} does NOT set a global maxClumps — the one field whose right value is per-seam`, () => {
      // `maxClumps` bounds EMITTED WORK UNITS at a seam that CREATES work.
      // Intake creates nothing, so its baseline is uncapped; a template that
      // wrote a global 20 would re-impose the cap that buckets a measured 128
      // filed issues, and would do it by scaffold rather than by decision.
      const file = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
      const parsed = JSON.parse(render(fs.readFileSync(file, 'utf-8'))) as {
        clumping?: Record<string, unknown>;
      };
      expect(parsed.clumping!['maxClumps']).toBeUndefined();
    });
  }
});
