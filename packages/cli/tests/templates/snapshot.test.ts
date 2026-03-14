import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { TemplateEngine } from '../../src/templates/engine';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

describe('template snapshots', () => {
  const engine = new TemplateEngine(TEMPLATES_DIR);

  for (const level of ['basic', 'intermediate', 'advanced'] as const) {
    it(`${level} template output matches snapshot`, () => {
      const resolved = engine.resolveTemplate(level);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        level,
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const fileMap = Object.fromEntries(
        rendered.value.files.map((f) => [f.relativePath, f.content])
      );
      expect(fileMap).toMatchSnapshot();
    });
  }
});
