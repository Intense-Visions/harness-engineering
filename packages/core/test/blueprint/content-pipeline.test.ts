import { ContentPipeline } from './content-pipeline';
import { BlueprintModule } from './types';
import { describe, it, expect } from 'vitest';

describe('ContentPipeline', () => {
  it('generates content for a module', async () => {
    const pipeline = new ContentPipeline();
    const module: BlueprintModule = {
      id: 'm1',
      files: ['src/index.ts'],
      content: null as any,
    };
    const content = await pipeline.generateModuleContent(module);
    expect(content).toHaveProperty('codeTranslation');
  });
});
