import { describe, it, expect } from 'vitest';
import { BlueprintGenerator } from '../../src/blueprint/generator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BlueprintGenerator', () => {
  it('should generate blueprint files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-blueprint-test-'));
    const generator = new BlueprintGenerator();
    const data = {
      projectName: 'test-project',
      generatedAt: new Date().toISOString(),
      modules: [
        { id: 'm1', title: 'M1', description: 'Desc', files: [] }
      ]
    };
    
    await generator.generate(data, { outputDir: tmpDir });
    
    const indexHtml = await fs.readFile(path.join(tmpDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('<title>Blueprint: test-project</title>');
    expect(indexHtml).toContain('<h2>M1</h2>');
  });
});
