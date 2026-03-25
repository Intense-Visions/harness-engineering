import { Content, BlueprintModule } from './types';
import { llmService } from '../shared/llm';

export class ContentPipeline {
  async generateModuleContent(module: BlueprintModule): Promise<Content> {
    const codeContext = module.files.join('\n');
    const translation = await llmService.generate(
      `You are a technical educator. Explain the following code clearly and concisely: ${codeContext}`
    );

    return {
      codeTranslation: translation,
    };
  }
}
