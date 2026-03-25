import * as fs from 'node:fs/promises';
import { parse } from 'yaml';
import { WorkflowDefinition, Result, Ok, Err } from '@harness-engineering/types';
import { validateWorkflowConfig } from './config';

export class WorkflowLoader {
  async loadWorkflow(filePath: string): Promise<Result<WorkflowDefinition, Error>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parts = content.split('---');

      if (parts.length < 3) {
        return Err(
          new Error(
            `Invalid WORKFLOW.md format at ${filePath}. Expected frontmatter surrounded by '---'.`
          )
        );
      }

      const yamlContent = parts[1]!.trim();
      const promptTemplate = parts.slice(2).join('---').trim();

      const configData = parse(yamlContent);
      const configResult = validateWorkflowConfig(configData);

      if (!configResult.ok) {
        return Err(configResult.error);
      }

      return Ok({
        config: configResult.value,
        promptTemplate,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
