import * as fs from 'fs/promises';
import * as path from 'path';
import * as ejs from 'ejs';
import { BlueprintData, BlueprintOptions } from './types';
import { SHELL_TEMPLATE, STYLES, SCRIPTS } from './templates';
import { ContentPipeline } from './content-pipeline';

export class BlueprintGenerator {
  private contentPipeline = new ContentPipeline();

  async generate(data: BlueprintData, options: BlueprintOptions): Promise<void> {
    await Promise.all(data.modules.map(async (module) => {
      module.content = await this.contentPipeline.generateModuleContent(module);
    }));

    const html = ejs.render(SHELL_TEMPLATE, {
      ...data,
      styles: STYLES,
      scripts: SCRIPTS,
    });
    
    await fs.mkdir(options.outputDir, { recursive: true });
    await fs.writeFile(path.join(options.outputDir, 'index.html'), html);
  }
}
