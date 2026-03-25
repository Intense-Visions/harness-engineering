import { BlueprintModule } from './types';
import { llmService } from '../shared/llm';

export interface Content {
  codeTranslation: string;
  quiz: Quiz;
}

export interface Quiz {
  questions: {
    question: string;
    answer: string;
  }[];
}

export class ContentPipeline {
  async generateModuleContent(module: BlueprintModule): Promise<Content> {
    const codeContext = module.files.join('\n');
    const translation = await llmService.generate(
      `You are a technical educator. Explain the following code clearly and concisely: ${codeContext}`
    );
    const quizJson = await llmService.generate(
      `Create 3 technical quiz questions for this code. Return ONLY valid JSON in this format: { "questions": [{ "question": "...", "answer": "..." }] }. Code: ${codeContext}`
    );

    let quiz: Quiz;
    try {
      // Clean potential markdown code blocks
      const cleanJson = quizJson
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      quiz = JSON.parse(cleanJson);
    } catch (e) {
      console.error('Failed to parse quiz JSON', e);
      quiz = { questions: [{ question: 'Failed to generate quiz', answer: 'N/A' }] };
    }

    return {
      codeTranslation: translation,
      quiz: quiz,
    };
  }
}
