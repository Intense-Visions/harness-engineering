export interface LLMService {
  generate(prompt: string): Promise<string>;
}

export class MockLLMService implements LLMService {
  async generate(prompt: string): Promise<string> {
    return 'This is a mock LLM response for: ' + prompt;
  }
}

export const llmService = new MockLLMService();
