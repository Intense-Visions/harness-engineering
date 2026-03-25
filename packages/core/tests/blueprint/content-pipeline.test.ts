import { describe, it, expect } from 'vitest';
import { ContentPipeline } from '../../src/blueprint/content-pipeline';
import { BlueprintModule } from '../../src/blueprint/types';

describe('ContentPipeline', () => {
  it('should generate skeleton content', async () => {
    const pipeline = new ContentPipeline();
    const module: BlueprintModule = { name: 'test-module', files: [] } as any;
    const content = await pipeline.generateModuleContent(module);

    expect(content.codeTranslation).toBeDefined();
    expect(content.quiz.questions.length).toBeGreaterThan(0);
  });
});
