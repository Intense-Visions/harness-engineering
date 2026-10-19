import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * #2071 follow-up: a shipped template must not configure a gate it cannot run.
 *
 * The `perf` and `entropy` checks start from a reachability walk. With no
 * `performance.entryPoints` (and no `entropy.entryPoints` to fall back on) the
 * analyzers cannot resolve a graph, and since #2071 a crashed analyzer abstains
 * and fails the run instead of being downgraded to a warning. So a template
 * that sets complexity/coupling thresholds but no entry point scaffolds a
 * project whose very first `harness ci check` is red — on generated config
 * containing none of the documented remedies.
 *
 * This reads the shipped `.hbs` templates directly rather than running `init`,
 * because the defect lives in the template text.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');

function templateConfigs(): Array<{ name: string; config: Record<string, unknown> }> {
  const names = fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const configs: Array<{ name: string; config: Record<string, unknown> }> = [];
  for (const name of names) {
    const file = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
    if (!fs.existsSync(file)) continue;
    // The only interpolation in these files is inside JSON string values, so
    // blanking the placeholders leaves parseable JSON.
    const raw = fs.readFileSync(file, 'utf-8').replace(/\{\{[^}]+\}\}/g, 'placeholder');
    configs.push({ name, config: JSON.parse(raw) as Record<string, unknown> });
  }
  return configs;
}

describe('shipped templates: a configured perf gate must be runnable (#2071)', () => {
  it('finds the template configs to check', () => {
    // Guard against the glob silently matching nothing — a vacuous pass here
    // would hide the very class of defect this file exists for.
    expect(templateConfigs().length).toBeGreaterThan(0);
  });

  it.each(templateConfigs())(
    '$name: configures performance.entryPoints whenever it configures performance thresholds',
    ({ config }) => {
      const performance = config.performance as Record<string, unknown> | undefined;
      const entropy = config.entropy as Record<string, unknown> | undefined;
      if (!performance) return; // No thresholds claimed, nothing to enforce.

      const hasThresholds =
        performance.complexity !== undefined ||
        performance.coupling !== undefined ||
        performance.sizeBudget !== undefined;
      if (!hasThresholds) return;

      const entryPoints =
        (entropy?.entryPoints as string[] | undefined) ??
        (performance.entryPoints as string[] | undefined);

      expect(
        entryPoints,
        'thresholds configured but no entry point to apply them to'
      ).toBeDefined();
      expect(entryPoints!.length).toBeGreaterThan(0);
    }
  );
});
