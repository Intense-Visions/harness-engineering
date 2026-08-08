import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { findConfigFile, loadConfig } from '../../config/loader.js';
import { resolveDocsPublishConnector } from '../../docs-publish/index.js';
import type {
  AttachMediaInput,
  DocsPublishConnector,
  DraftInput,
  PageTreeInput,
  PageTreeNode,
  VerifyRenderInput,
} from '../../docs-publish/index.js';

export const docsPublishDefinition = {
  name: 'docs_publish',
  description:
    'Draft-first docs publishing via the configured connector (draft/attach-media/verify-render/page-tree).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      op: {
        type: 'string',
        enum: ['draft', 'attach-media', 'verify-render', 'page-tree'],
        description: 'Operation to run',
      },
      path: { type: 'string', description: 'Project root path for config resolution' },
      pageId: { type: 'string', description: 'Page id (draft/attach-media)' },
      spaceId: { type: 'string', description: 'Space id (draft/page-tree)' },
      title: { type: 'string', description: 'Page title (draft)' },
      parentId: { type: 'string', description: 'Parent page id (draft/page-tree)' },
      body: { type: 'string', description: 'Storage/body string (draft)' },
      adf: { type: 'object', description: 'Page body as ADF (draft)' },
      mediaFilePath: { type: 'string', description: 'Local media file path (attach-media)' },
      origin: { type: 'string', description: 'Provider origin (attach-media)' },
      targetUrl: { type: 'string', description: 'Rendered URL to assert (verify-render)' },
      children: {
        type: 'array',
        description: 'Child nodes to create/order (page-tree)',
      },
    },
    required: ['op'],
  },
};

interface DocsPublishToolInput {
  op: string;
  path?: string;
  pageId?: string;
  spaceId?: string;
  title?: string;
  parentId?: string;
  body?: string;
  adf?: unknown;
  mediaFilePath?: string;
  origin?: string;
  targetUrl?: string;
  children?: PageTreeNode[];
  [k: string]: unknown;
}

type Connector = DocsPublishConnector;

/** A structured op result (ok→value, error→message) mapped to an MCP response. */
function respond<T>(
  result: { ok: true; value: T } | { ok: false; error: string }
): McpToolResponse {
  return result.ok
    ? resultToMcpResponse(Ok(result.value))
    : resultToMcpResponse(Err(new Error(result.error)));
}

async function opDraft(c: Connector, input: DocsPublishToolInput): Promise<McpToolResponse> {
  if (!input.spaceId || !input.title) {
    return resultToMcpResponse(Err(new Error('draft requires spaceId and title')));
  }
  const draftInput: DraftInput = { spaceId: input.spaceId, title: input.title };
  if (input.pageId) draftInput.pageId = input.pageId;
  if (input.parentId) draftInput.parentId = input.parentId;
  if (input.body !== undefined) draftInput.body = input.body;
  if (input.adf !== undefined) draftInput.adf = input.adf;
  return respond(await c.draft(draftInput));
}

async function opAttachMedia(c: Connector, input: DocsPublishToolInput): Promise<McpToolResponse> {
  if (!input.pageId || !input.mediaFilePath) {
    return resultToMcpResponse(Err(new Error('attach-media requires pageId and mediaFilePath')));
  }
  const attachInput: AttachMediaInput = {
    pageId: input.pageId,
    mediaFilePath: input.mediaFilePath,
  };
  if (input.origin) attachInput.origin = input.origin;
  return resultToMcpResponse(Ok(await c.attachMedia(attachInput)));
}

async function opVerifyRender(c: Connector, input: DocsPublishToolInput): Promise<McpToolResponse> {
  if (!input.targetUrl) {
    return resultToMcpResponse(Err(new Error('verify-render requires targetUrl')));
  }
  const verifyInput: VerifyRenderInput = { targetUrl: input.targetUrl };
  return resultToMcpResponse(Ok(await c.verifyRender(verifyInput)));
}

async function opPageTree(c: Connector, input: DocsPublishToolInput): Promise<McpToolResponse> {
  if (!input.spaceId || !input.parentId || !Array.isArray(input.children)) {
    return resultToMcpResponse(
      Err(new Error('page-tree requires spaceId, parentId, and a children array'))
    );
  }
  const treeInput: PageTreeInput = {
    spaceId: input.spaceId,
    parentId: input.parentId,
    children: input.children,
  };
  return respond(await c.pageTree(treeInput));
}

const OP_HANDLERS: Record<
  string,
  (c: Connector, input: DocsPublishToolInput) => Promise<McpToolResponse>
> = {
  draft: opDraft,
  'attach-media': opAttachMedia,
  'verify-render': opVerifyRender,
  'page-tree': opPageTree,
};

export async function handleDocsPublish(input: DocsPublishToolInput): Promise<McpToolResponse> {
  const projectPath = input.path ? sanitizePath(input.path) : process.cwd();

  const configPathResult = findConfigFile(projectPath);
  if (!configPathResult.ok) {
    return resultToMcpResponse(Err(new Error(configPathResult.error.message)));
  }
  const configResult = loadConfig(configPathResult.value);
  if (!configResult.ok) {
    return resultToMcpResponse(Err(new Error(configResult.error.message)));
  }

  const connectorResult = resolveDocsPublishConnector(configResult.value);
  if (!connectorResult.ok) {
    // Not-configured / unknown-connector degrades to an actionable isError.
    return resultToMcpResponse(Err(new Error(connectorResult.error.message)));
  }

  const handler = OP_HANDLERS[input.op];
  if (!handler) {
    return resultToMcpResponse(Err(new Error(`Unknown op: ${input.op}`)));
  }

  try {
    return await handler(connectorResult.value, input);
  } catch (error) {
    return resultToMcpResponse(
      Err(new Error(error instanceof Error ? error.message : String(error)))
    );
  }
}
