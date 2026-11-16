import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TemplateEngine } from '../../src/templates/engine';

/**
 * #2630 follow-up: TypeScript scaffolds pinned `@harness-engineering/eslint-plugin`
 * at a hardcoded `^0.1.0`, years behind the published plugin, so a fresh
 * scaffold installed a plugin missing the rules its own eslint config enables.
 * The pin is now `^{{eslintPluginVersion}}`, filled by the engine from the
 * real eslint-plugin version (embedded into the published CLI at build time).
 */

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const TEMPLATES_DIR = path.join(REPO, 'templates');
const ESLINT_PLUGIN_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(REPO, 'packages', 'eslint-plugin', 'package.json'), 'utf-8')
).version;

const engine = new TemplateEngine(TEMPLATES_DIR);

function pin(level: string, context: Record<string, string> = {}): string | undefined {
  const resolved = engine.resolveTemplate(level);
  if (!resolved.ok) throw new Error(resolved.error.message);
  const rendered = engine.render(resolved.value, { projectName: 'pin-test', level, ...context });
  if (!rendered.ok) throw new Error(rendered.error.message);
  const pkg = JSON.parse(
    rendered.value.files.find((f) => f.relativePath === 'package.json')!.content
  );
  return pkg.devDependencies?.['@harness-engineering/eslint-plugin'];
}

describe('scaffolded @harness-engineering/eslint-plugin pin (#2630)', () => {
  it.each(['intermediate', 'load-bearing-minimum', 'advanced'])(
    '%s pins the real eslint-plugin version',
    (level) => {
      expect(pin(level)).toBe(`^${ESLINT_PLUGIN_VERSION}`);
    }
  );

  it('honours an explicit eslintPluginVersion in the context', () => {
    expect(pin('advanced', { eslintPluginVersion: '9.9.9' })).toBe('^9.9.9');
  });

  it('no template hardcodes an eslint-plugin version', () => {
    for (const level of ['intermediate', 'load-bearing-minimum', 'advanced']) {
      const raw = fs.readFileSync(path.join(TEMPLATES_DIR, level, 'package.json.hbs'), 'utf-8');
      expect(raw).toMatch(/"@harness-engineering\/eslint-plugin": "\^\{\{eslintPluginVersion\}\}"/);
    }
  });

  it('the published CLI build embeds the eslint-plugin version from its package.json', async () => {
    const { ESLINT_PLUGIN_VERSION_DEFINE } = await import('../../tsup.config');
    expect(ESLINT_PLUGIN_VERSION_DEFINE).toBe(JSON.stringify(ESLINT_PLUGIN_VERSION));
  });
});
