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

/**
 * Keys these templates ship today that the schema drops, recorded rather than
 * fixed here.
 *
 * THIS IS A PRE-EXISTING DEFECT THIS GATE FOUND, not an exemption it grants.
 * All four language-base templates declare a ROOT-LEVEL `tooling` block
 * (`packageManager` / `linter` / `formatter` / `buildTool` / `testRunner`).
 * The schema's key for exactly that shape is `template.tooling`
 * (`config/schema.ts:1340`, documented in `docs/reference/configuration.md`
 * §ToolingConfig Object), so this is a MIS-NESTING — the precise defect class
 * the stripped-key warner was built for in issue #862 — and the templates
 * themselves ship it. Every project scaffolded from one prints
 * `ignored unknown key 'tooling'` on its first `harness` command, and the
 * toolchain it declares is read by nothing.
 *
 * Moving it under `template` is a one-line fix per template, and it is a
 * decision about the language-base templates rather than about clumping, so it
 * is NAMED here and left to be made deliberately instead of being quietly
 * folded into an unrelated phase.
 *
 * Listed per template and per key so the baseline cannot grow silently: a new
 * dropped key, or the same key in a new template, still fails.
 */
const KNOWN_DROPPED: Record<string, readonly string[]> = {
  'go-base': ['tooling'],
  'java-base': ['tooling'],
  'python-base': ['tooling'],
  'rust-base': ['tooling'],
};

const configTemplates = fs
  .readdirSync(TEMPLATES_DIR)
  .filter((d) => fs.statSync(path.join(TEMPLATES_DIR, d)).isDirectory())
  .map((d) => [d, path.join(TEMPLATES_DIR, d, 'harness.config.json.hbs')] as const)
  .filter(([, file]) => fs.existsSync(file));

describe('adopter config templates validate', () => {
  it('there are templates to check — a zero-length loop would pass vacuously', () => {
    expect(configTemplates.length).toBeGreaterThan(4);
  });

  for (const [name, file] of configTemplates) {
    it(`${name}/harness.config.json.hbs renders to a valid harness config`, () => {
      const rendered = render(fs.readFileSync(file, 'utf-8'));

      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(rendered);
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
      const parsed = JSON.parse(render(fs.readFileSync(file, 'utf-8')));
      const dropped = collectStrippedKeys(HarnessConfigSchema, parsed).map((d) => d.path);
      expect(dropped.filter((k) => !KNOWN_DROPPED[name]?.includes(k))).toEqual([]);
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

  it('the recorded baseline is REAL — each named template really does drop that key today', () => {
    // A baseline nobody checks rots into an exemption. If `tooling` is given a
    // schema key or deleted from a template, this fails and the entry must go.
    for (const [name, keys] of Object.entries(KNOWN_DROPPED)) {
      const file = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
      const parsed = JSON.parse(render(fs.readFileSync(file, 'utf-8')));
      const dropped = collectStrippedKeys(HarnessConfigSchema, parsed).map((d) => d.path);
      expect(dropped.sort(), `${name} no longer drops ${keys.join(', ')}`).toEqual(
        [...keys].sort()
      );
    }
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
      // wrote a global 20 would re-impose the cap that buckets ~300 filed
      // issues, and would do it by scaffold rather than by decision.
      const file = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
      const parsed = JSON.parse(render(fs.readFileSync(file, 'utf-8'))) as {
        clumping?: Record<string, unknown>;
      };
      expect(parsed.clumping!['maxClumps']).toBeUndefined();
    });
  }
});
