import { Liquid } from 'liquidjs';

export class PromptRenderer {
  private engine: Liquid;

  constructor() {
    this.engine = new Liquid({
      strictVariables: true,
      strictFilters: true,
    });
  }

  async render(template: string, context: Record<string, any>): Promise<string> {
    try {
      return await this.engine.render(this.engine.parse(template), context);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Template rendering failed: ${error.message}`);
      }
      throw error;
    }
  }
}
