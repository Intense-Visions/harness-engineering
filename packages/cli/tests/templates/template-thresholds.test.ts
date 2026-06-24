import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HarnessConfigSchema } from '../../src/config/schema';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

/**
 * Render a tier's harness.config.json.hbs the way the engine would: the config
 * template uses a single `{{projectName}}` token, so substituting it is enough
 * to produce parseable JSON for schema validation.
 */
function renderConfig(tier: string): unknown {
  const hbs = fs.readFileSync(path.join(TEMPLATES_DIR, tier, 'harness.config.json.hbs'), 'utf-8');
  const rendered = hbs.replace(/\{\{projectName\}\}/g, 'sample-project');
  return JSON.parse(rendered) as unknown;
}

describe('template architecture thresholds', () => {
  for (const tier of ['basic', 'intermediate']) {
    it(`${tier} template renders a config valid against HarnessConfigSchema`, () => {
      const result = HarnessConfigSchema.safeParse(renderConfig(tier));
      expect(result.success).toBe(true);
    });

    it(`${tier} template ships architecture, security, entropy, and performance blocks`, () => {
      const config = renderConfig(tier) as Record<string, unknown>;
      expect(config.architecture).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.entropy).toBeDefined();
      expect(config.performance).toBeDefined();

      const thresholds = (config.architecture as { thresholds?: Record<string, unknown> })
        .thresholds;
      expect(thresholds).toBeDefined();
      // Every adopter gets real gates from minute one — not just a layer linter.
      expect(thresholds).toHaveProperty('circular-deps');
      expect(thresholds).toHaveProperty('layer-violations');
      expect(thresholds).toHaveProperty('complexity');
      expect(thresholds).toHaveProperty('module-size');
      expect(thresholds).toHaveProperty('dependency-depth');
    });
  }

  it('basic uses a more lenient complexity cap than intermediate', () => {
    const basic = renderConfig('basic') as {
      architecture: { thresholds: { complexity: { max: number } } };
    };
    const intermediate = renderConfig('intermediate') as {
      architecture: { thresholds: { complexity: { max: number } } };
    };
    expect(basic.architecture.thresholds.complexity.max).toBe(20);
    expect(intermediate.architecture.thresholds.complexity.max).toBe(15);
    expect(basic.architecture.thresholds.complexity.max).toBeGreaterThan(
      intermediate.architecture.thresholds.complexity.max
    );
  });

  it('both tiers cap dependency-depth at 8', () => {
    for (const tier of ['basic', 'intermediate']) {
      const config = renderConfig(tier) as {
        architecture: { thresholds: { 'dependency-depth': { max: number } } };
      };
      expect(config.architecture.thresholds['dependency-depth'].max).toBe(8);
    }
  });
});
