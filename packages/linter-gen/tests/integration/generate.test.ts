import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generate } from '../../src/generator/orchestrator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('integration: generate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linter-gen-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('generates working ESLint rules from config', { timeout: 15000 }, async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: no-react-in-services
    type: import-restriction
    severity: error
    config:
      source: "src/services/**"
      forbiddenImports:
        - "react"
        - "react-dom"
      message: "Service files cannot import React"
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Verify generated rule file
    const ruleContent = await fs.readFile(path.join(outputDir, 'no-react-in-services.ts'), 'utf-8');

    expect(ruleContent).toContain("name: 'no-react-in-services'");
    expect(ruleContent).toContain('Service files cannot import React');
    expect(ruleContent).toContain('"react"');
    expect(ruleContent).toContain('"react-dom"');

    // Verify index file
    const indexContent = await fs.readFile(path.join(outputDir, 'index.ts'), 'utf-8');

    expect(indexContent).toContain("import noReactInServices from './no-react-in-services'");
    expect(indexContent).toContain("'no-react-in-services': noReactInServices");
  });

  it('uses custom template from templates/ directory', async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');
    const templatesDir = path.join(tempDir, 'templates');

    await fs.mkdir(templatesDir);
    await fs.writeFile(
      path.join(templatesDir, 'custom-check.ts.hbs'),
      `// Custom template
export const ruleName = '{{name}}';
export const config = {{{json config}}};`
    );

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: my-custom-rule
    type: custom-check
    config:
      foo: bar
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ruleContent = await fs.readFile(path.join(outputDir, 'my-custom-rule.ts'), 'utf-8');

    expect(ruleContent).toContain('// Custom template');
    expect(ruleContent).toContain("ruleName = 'my-custom-rule'");
    expect(ruleContent).toContain('"foo":"bar"');
  });

  it('generates multiple rules in single run', async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: rule-one
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["lodash"]
      message: "No lodash"
  - name: rule-two
    type: import-restriction
    config:
      source: "lib/**"
      forbiddenImports: ["jquery"]
      message: "No jQuery"
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.rulesGenerated).toHaveLength(2);
    expect(result.rulesGenerated).toContain('rule-one');
    expect(result.rulesGenerated).toContain('rule-two');

    // Verify index exports both
    const indexContent = await fs.readFile(path.join(outputDir, 'index.ts'), 'utf-8');
    expect(indexContent).toContain('ruleOne');
    expect(indexContent).toContain('ruleTwo');
  });
});
