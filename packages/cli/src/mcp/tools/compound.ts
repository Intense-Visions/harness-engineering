import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../utils/sanitize-path.js';
import type { McpToolResponse } from '../utils/result-adapter.js';

// Lock handles live in the MCP server process. The server's PID is what gets
// written into the lock file by core's acquireCompoundLock — which is correct,
// because the server *is* the process holding the lock. Agents acquire by
// calling the MCP tool, get back an opaque token, then release by passing the
// token. If the agent abandons (token never released), the lock leaks; recovery
// matches the existing file-lock semantics (delete the lock file).
type CompoundLockHandle = {
  release: () => void;
  category: string;
  lockPath: string;
};

const HANDLES = new Map<string, CompoundLockHandle>();

function mcpJson(payload: unknown, isError = false): McpToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError };
}

function mcpError(message: string): McpToolResponse {
  return mcpJson({ error: message }, true);
}

interface AcquireInput {
  path: string;
  category: string;
}

export const acquireCompoundLockDefinition = {
  name: 'acquire_compound_lock',
  description:
    'Acquire a per-category compound lock at `.harness/locks/compound-<category>.lock` under the project root. Returns `{ acquired, token, lockPath }` on success or `{ acquired: false, error, holderPid, lockPath }` on contention. The returned token must be passed to release_compound_lock when the write completes. Categories must be one of the documented bug-track/knowledge-track categories.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
      category: {
        type: 'string',
        description:
          "Solution category (e.g., 'build-errors', 'architecture-patterns'). See packages/core/src/solutions/schema.ts for the full list.",
      },
    },
    required: ['path', 'category'],
  },
};

export async function handleAcquireCompoundLock(input: AcquireInput): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const core = await import('@harness-engineering/core');
  try {
    const handle = core.acquireCompoundLock(
      input.category as Parameters<typeof core.acquireCompoundLock>[0],
      { cwd: projectPath }
    );
    const token = randomUUID();
    HANDLES.set(token, {
      release: handle.release.bind(handle),
      category: handle.category,
      lockPath: handle.lockPath,
    });
    return mcpJson({
      acquired: true,
      token,
      category: handle.category,
      lockPath: handle.lockPath,
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      (error as { name?: string }).name === 'CompoundLockHeldError'
    ) {
      const held = error as { category: string; holderPid: number; lockPath: string };
      return mcpJson(
        {
          acquired: false,
          error: 'CompoundLockHeldError',
          category: held.category,
          holderPid: held.holderPid,
          lockPath: held.lockPath,
        },
        true
      );
    }
    return mcpJson(
      { acquired: false, error: error instanceof Error ? error.message : String(error) },
      true
    );
  }
}

interface ReleaseInput {
  token: string;
}

export const releaseCompoundLockDefinition = {
  name: 'release_compound_lock',
  description:
    'Release a previously-acquired compound lock by its token. Returns { released: true } when the token matches a live handle; { released: false, error } otherwise. Idempotent: calling twice with the same token is not an error after the first release.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      token: {
        type: 'string',
        description: 'Token returned by acquire_compound_lock',
      },
    },
    required: ['token'],
  },
};

export async function handleReleaseCompoundLock(input: ReleaseInput): Promise<McpToolResponse> {
  const handle = HANDLES.get(input.token);
  if (handle === undefined) {
    return mcpJson(
      {
        released: false,
        error: 'unknown token (already released, or never acquired)',
      },
      true
    );
  }
  try {
    handle.release();
  } catch (error) {
    return mcpJson(
      { released: false, error: error instanceof Error ? error.message : String(error) },
      true
    );
  }
  HANDLES.delete(input.token);
  return mcpJson({ released: true, category: handle.category, lockPath: handle.lockPath });
}

// Test-only escape hatch so suites can reset state between cases.
export function _resetCompoundLockHandlesForTests(): void {
  for (const handle of HANDLES.values()) {
    try {
      handle.release();
    } catch {
      /* best-effort */
    }
  }
  HANDLES.clear();
}
