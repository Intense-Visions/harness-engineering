import * as path from 'path';
import { resolveProjectConfig } from '../utils/config-resolver.js';

export const validateToolDefinition = {
  name: 'validate_project',
  description: 'Run all validation checks on a harness engineering project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
    },
    required: ['path'],
  },
};

export async function handleValidateProject(input: { path: string }) {
  const projectPath = path.resolve(input.path);
  const errors: string[] = [];
  const checks: {
    config: 'pass' | 'fail';
    structure: 'pass' | 'fail' | 'skipped';
    agentsMap: 'pass' | 'fail' | 'skipped';
  } = {
    config: 'fail',
    structure: 'skipped',
    agentsMap: 'skipped',
  };

  // 1. Load config
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) {
    errors.push(`Config: ${configResult.error.message}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, checks, errors }) }],
    };
  }
  checks.config = 'pass';
  const config = configResult.value;

  // 2. Run validateFileStructure if conventions are available
  try {
    const core = await import('@harness-engineering/core');
    if (
      typeof core.validateFileStructure === 'function' &&
      Array.isArray((config as any).conventions)
    ) {
      const structureResult = await core.validateFileStructure(
        projectPath,
        (config as any).conventions
      );
      if (structureResult.ok) {
        checks.structure = structureResult.value.valid ? 'pass' : 'fail';
        if (!structureResult.value.valid) {
          for (const missing of structureResult.value.missing) {
            errors.push(`Missing required file: ${missing}`);
          }
        }
      } else {
        checks.structure = 'fail';
        errors.push(`Structure validation error: ${structureResult.error.message}`);
      }
    }
  } catch {
    // core not available, skip
  }

  // 3. Run validateAgentsMap
  try {
    const core = await import('@harness-engineering/core');
    if (typeof core.validateAgentsMap === 'function') {
      const agentsMapPath = path.join(projectPath, 'AGENTS.md');
      const agentsResult = await core.validateAgentsMap(agentsMapPath);
      if (agentsResult.ok) {
        checks.agentsMap = agentsResult.value.valid ? 'pass' : 'fail';
        if (!agentsResult.value.valid) {
          if (agentsResult.value.missingSections.length > 0) {
            errors.push(
              `AGENTS.md missing sections: ${agentsResult.value.missingSections.join(', ')}`
            );
          }
          if (agentsResult.value.brokenLinks.length > 0) {
            errors.push(`AGENTS.md has ${agentsResult.value.brokenLinks.length} broken link(s)`);
          }
        }
      } else {
        checks.agentsMap = 'fail';
        errors.push(`AGENTS.md validation error: ${agentsResult.error.message}`);
      }
    }
  } catch {
    // core not available, skip
  }

  const valid = errors.length === 0;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ valid, checks, errors }) }],
  };
}
