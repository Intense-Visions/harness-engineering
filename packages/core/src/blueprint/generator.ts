import * as fs from 'fs/promises';
import * as path from 'path';
import * as ejs from 'ejs';
import { BlueprintData, BlueprintOptions } from './types';
import { SHELL_TEMPLATE, STYLES, SCRIPTS } from './templates';

export class BlueprintGenerator {
  async generate(data: BlueprintData, options: BlueprintOptions): Promise<void> {
    const html = ejs.render(SHELL_TEMPLATE, {
      ...data,
      styles: STYLES,
      scripts: SCRIPTS,
    });

    await fs.mkdir(options.outputDir, { recursive: true });
    await fs.writeFile(path.join(options.outputDir, 'index.html'), html);
  }
}
