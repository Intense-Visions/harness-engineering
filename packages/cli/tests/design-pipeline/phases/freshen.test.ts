import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runFreshen } from '../../../src/design-pipeline/phases/freshen';
import { newContext } from '../../../src/design-pipeline/context';

describe('runFreshen', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-freshen-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('marks all inputs absent on empty project', () => {
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.graphAvailable).toBe(false);
    expect(ctx.inputs.designMdExists).toBe(false);
    expect(ctx.inputs.tokensJsonExists).toBe(false);
    expect(ctx.inputs.componentRegistryExists).toBe(false);
    expect(ctx.inputs.brandRulesExist).toBe(false);
  });

  it('detects DESIGN.md presence', () => {
    writeFile('design-system/DESIGN.md', '# Design');
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.inputs.designMdExists).toBe(true);
    expect(ctx.inputs.componentRegistryExists).toBe(false);
    expect(ctx.inputs.brandRulesExist).toBe(false);
  });

  it('detects ## Component Registry section', () => {
    writeFile(
      'design-system/DESIGN.md',
      `# Design\n\n## Component Registry\n\n| Type | File |\n|---|---|\n`
    );
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.inputs.componentRegistryExists).toBe(true);
  });

  it('detects ## Brand Rules section', () => {
    writeFile('design-system/DESIGN.md', `# Design\n\n## Brand Rules\n\n### Voice\n`);
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.inputs.brandRulesExist).toBe(true);
  });

  it('detects tokens.json presence', () => {
    writeFile('design-system/tokens.json', '{}');
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.inputs.tokensJsonExists).toBe(true);
  });

  it('detects .harness/graph directory for graphAvailable', () => {
    fs.mkdirSync(path.join(tmpDir, '.harness', 'graph'), { recursive: true });
    const ctx = newContext();
    runFreshen({ projectRoot: tmpDir, context: ctx });
    expect(ctx.graphAvailable).toBe(true);
  });
});
