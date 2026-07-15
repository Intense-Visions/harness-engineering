import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'yaml';
import { WorkflowDefinition, Result, Ok, Err } from '@harness-engineering/types';
import { validateWorkflowConfig } from './config';
import { discoverSkillCatalogNames } from './skill-catalog';

export class WorkflowLoader {
  async loadWorkflow(filePath: string): Promise<Result<WorkflowDefinition, Error>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parts = content.split('---');

      if (parts.length < 3) {
        return Err(
          new Error(
            `Invalid harness.orchestrator.md format at ${filePath}. Expected frontmatter surrounded by '---'.`
          )
        );
      }

      const yamlContent = parts[1]!.trim();
      const promptTemplate = parts.slice(2).join('---').trim();

      const configData = parse(yamlContent);

      // Spec B Phase 2 / S3: discover the local skill catalog so that
      // `routing.skills.<name>` entries can be cross-checked against
      // declared skill names. The project root is derived from the
      // workflow file's parent directory — matches how `harness validate`
      // and other CLI commands locate the project root from a passed-in
      // config path.
      const projectRoot = path.dirname(path.resolve(filePath));
      const knownSkillNames = discoverSkillCatalogNames(projectRoot);

      const configResult = validateWorkflowConfig(configData, { knownSkillNames });

      if (!configResult.ok) {
        return Err(configResult.error);
      }

      // Phase 1 (local-backend-full-workflow): load the backend-aware local
      // dispatch template from the sibling file when present. Absent -> undefined,
      // so resolution falls back to the default template (SC5). We read it
      // best-effort: a missing file is expected (fallback), not an error.
      const localTemplatePath = path.join(path.dirname(filePath), 'harness.orchestrator.local.md');
      let localPromptTemplate: string | undefined;
      try {
        const localContent = await fs.readFile(localTemplatePath, 'utf-8');
        const localParts = localContent.split('---');
        localPromptTemplate =
          localParts.length >= 3 ? localParts.slice(2).join('---').trim() : localContent.trim();
      } catch {
        localPromptTemplate = undefined;
      }

      // `exactOptionalPropertyTypes` is on repo-wide: spread the optional key
      // ONLY when defined so an absent local file leaves the property absent
      // (never `localPromptTemplate: undefined`). Both cases resolve to the
      // default template downstream (SC5).
      return Ok({
        config: configResult.value.config,
        promptTemplate,
        ...(localPromptTemplate !== undefined ? { localPromptTemplate } : {}),
        warnings: configResult.value.warnings,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
