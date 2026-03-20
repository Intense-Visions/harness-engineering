import * as path from 'path';
import { sanitizePath } from '../utils/sanitize-path.js';

export const addComponentDefinition = {
  name: 'add_component',
  description:
    'Add a component (layer, doc, or component type) to the project using the harness CLI',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      type: {
        type: 'string',
        enum: ['layer', 'doc', 'component'],
        description: 'Type of component to add',
      },
      name: { type: 'string', description: 'Name of the component to add' },
    },
    required: ['path', 'type', 'name'],
  },
};

const COMPONENT_NAME_REGEX = /^[a-z0-9][a-z0-9._-]{0,64}$/i;

export async function handleAddComponent(input: {
  path: string;
  type: 'layer' | 'doc' | 'component';
  name: string;
}) {
  const projectPath = sanitizePath(input.path);

  const ALLOWED_TYPES = new Set(['layer', 'doc', 'component']);
  if (!ALLOWED_TYPES.has(input.type)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: `Invalid component type: ${input.type}` }),
        },
      ],
      isError: true,
    };
  }

  if (!COMPONENT_NAME_REGEX.test(input.name)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Invalid component name: must match ${COMPONENT_NAME_REGEX} (lowercase alphanumeric, dots, hyphens, underscores, max 65 chars)`,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const { execFileSync } = await import('node:child_process');
    const output = execFileSync('npx', ['harness', 'add', input.type, input.name], {
      cwd: projectPath,
      stdio: 'pipe',
    });
    return {
      content: [{ type: 'text' as const, text: output.toString() }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `add_component failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
      isError: true,
    };
  }
}

export const runAgentTaskDefinition = {
  name: 'run_agent_task',
  description: 'Run an agent task using the harness CLI',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task: { type: 'string', description: 'Task to run' },
      path: { type: 'string', description: 'Path to project root directory' },
      timeout: { type: 'number', description: 'Timeout in milliseconds' },
    },
    required: ['task'],
  },
};

const ALLOWED_AGENT_TASKS = new Set(['review', 'doc-review', 'test-review']);

export async function handleRunAgentTask(input: { task: string; path?: string; timeout?: number }) {
  if (!ALLOWED_AGENT_TASKS.has(input.task)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Invalid task: "${input.task}". Allowed tasks: ${[...ALLOWED_AGENT_TASKS].join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const projectPath = input.path ? sanitizePath(input.path) : process.cwd();

  try {
    const { execFileSync } = await import('node:child_process');
    const output = execFileSync('npx', ['harness', 'agent', 'run', input.task], {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: input.timeout,
    });
    return {
      content: [{ type: 'text' as const, text: output.toString() }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `run_agent_task failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
      isError: true,
    };
  }
}
