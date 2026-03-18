import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolvePersonasDir } from '../utils/paths.js';

export const listPersonasDefinition = {
  name: 'list_personas',
  description: 'List available agent personas',
  inputSchema: { type: 'object' as const, properties: {} },
};

export async function handleListPersonas() {
  const { listPersonas } = await import('@harness-engineering/cli');
  const result = listPersonas(resolvePersonasDir());
  return resultToMcpResponse(result);
}

export const generatePersonaArtifactsDefinition = {
  name: 'generate_persona_artifacts',
  description: 'Generate runtime config, AGENTS.md fragment, and CI workflow from a persona',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Persona name (e.g., architecture-enforcer)' },
      only: {
        type: 'string',
        enum: ['runtime', 'agents-md', 'ci'],
        description: 'Generate only a specific artifact type',
      },
    },
    required: ['name'],
  },
};

export async function handleGeneratePersonaArtifacts(input: { name: string; only?: string }) {
  const { loadPersona, generateRuntime, generateAgentsMd, generateCIWorkflow } =
    await import('@harness-engineering/cli');
  const filePath = path.join(resolvePersonasDir(), `${input.name}.yaml`);
  const personaResult = loadPersona(filePath);
  if (!personaResult.ok) return resultToMcpResponse(personaResult);

  const persona = personaResult.value;
  const artifacts: Record<string, string> = {};
  if (!input.only || input.only === 'runtime') {
    const r = generateRuntime(persona);
    if (r.ok) artifacts.runtime = r.value;
  }
  if (!input.only || input.only === 'agents-md') {
    const r = generateAgentsMd(persona);
    if (r.ok) artifacts.agentsMd = r.value;
  }
  if (!input.only || input.only === 'ci') {
    const r = generateCIWorkflow(persona, 'github');
    if (r.ok) artifacts.ciWorkflow = r.value;
  }
  return resultToMcpResponse(Ok(artifacts));
}

export const runPersonaDefinition = {
  name: 'run_persona',
  description: 'Execute all steps defined in a persona and return aggregated results',
  inputSchema: {
    type: 'object' as const,
    properties: {
      persona: { type: 'string', description: 'Persona name (e.g., architecture-enforcer)' },
      path: { type: 'string', description: 'Path to project root' },
      trigger: {
        type: 'string',
        enum: [
          'always',
          'on_pr',
          'on_commit',
          'on_review',
          'scheduled',
          'manual',
          'on_plan_approved',
          'auto',
        ],
        description: 'Trigger context for step filtering (default: auto)',
      },
      dryRun: { type: 'boolean', description: 'Preview without side effects' },
    },
    required: ['persona'],
  },
};

export async function handleRunPersona(input: {
  persona: string;
  path?: string;
  trigger?: string;
  dryRun?: boolean;
}) {
  const { loadPersona, runPersona, executeSkill } = await import('@harness-engineering/cli');
  const filePath = path.join(resolvePersonasDir(), `${input.persona}.yaml`);
  const personaResult = loadPersona(filePath);
  if (!personaResult.ok) return resultToMcpResponse(personaResult);

  const projectPath = input.path ? path.resolve(input.path) : process.cwd();
  const trigger = (input.trigger ?? 'auto') as
    | 'always'
    | 'on_pr'
    | 'on_commit'
    | 'on_review'
    | 'scheduled'
    | 'manual'
    | 'on_plan_approved'
    | 'auto';

  const { ALLOWED_PERSONA_COMMANDS } = await import('@harness-engineering/cli');

  const commandExecutor = async (command: string) => {
    if (!ALLOWED_PERSONA_COMMANDS.has(command)) {
      return Err(new Error(`Unknown harness command: ${command}`));
    }
    try {
      const { execFileSync } = await import('node:child_process');
      const args = ['harness', command];
      if (input.dryRun) args.push('--dry-run');
      const output = execFileSync('npx', args, {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: personaResult.value.config.timeout,
      });
      return Ok(output.toString());
    } catch (error) {
      return Err(
        new Error(`${command} failed: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  };

  const report = await runPersona(personaResult.value, {
    trigger,
    commandExecutor,
    skillExecutor: executeSkill,
    projectPath,
  });
  return resultToMcpResponse(Ok(report));
}
