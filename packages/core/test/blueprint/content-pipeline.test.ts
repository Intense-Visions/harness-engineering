import { ContentPipeline } from '../../src/blueprint/content-pipeline';
import { BlueprintModule } from '../../src/blueprint/types';
import { describe, it, expect } from 'vitest';

describe('ContentPipeline', () => {
  it('generates content for a module', async () => {
    const pipeline = new ContentPipeline();
    const module: BlueprintModule = {
      id: 'm1',
      title: 'Test Module',
      description: 'Test module for content pipeline',
      files: ['src/index.ts'],
    };
    const content = await pipeline.generateModuleContent(module);
    expect(content).toHaveProperty('codeTranslation');
  });
});
