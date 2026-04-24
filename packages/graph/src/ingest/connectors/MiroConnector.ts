import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText, withRetry } from './ConnectorUtils.js';

interface MiroBoard {
  id: string;
  name: string;
  description?: string;
}

interface MiroItem {
  id: string;
  type: string;
  data?: { content?: string };
}

interface MiroItemsResponse {
  data: MiroItem[];
}

/** Minimum character length for item content to be ingested. */
const MIN_CONTENT_LENGTH = 10;

/** Item types that produce business_concept nodes. */
const CONCEPT_ITEM_TYPES = new Set(['sticky_note', 'text']);

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function buildIngestResult(
  nodesAdded: number,
  edgesAdded: number,
  errors: string[],
  start: number
): IngestResult {
  return {
    nodesAdded,
    nodesUpdated: 0,
    edgesAdded,
    edgesUpdated: 0,
    errors,
    durationMs: Date.now() - start,
  };
}

export class MiroConnector implements GraphConnector {
  readonly name = 'miro';
  readonly source = 'miro';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? withRetry((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();

    const apiKeyEnv = config.apiKeyEnv ?? 'MIRO_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return buildIngestResult(
        0,
        0,
        [`Missing API key: environment variable "${apiKeyEnv}" is not set`],
        start
      );
    }

    const baseUrlEnv = config.baseUrlEnv ?? 'MIRO_BASE_URL';
    const baseUrl = process.env[baseUrlEnv] ?? 'https://api.miro.com';

    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.miro.com') {
        return buildIngestResult(
          0,
          0,
          [`Invalid ${baseUrlEnv}: must be an HTTPS URL on api.miro.com`],
          start
        );
      }
    } catch {
      return buildIngestResult(0, 0, [`Invalid ${baseUrlEnv}: not a valid URL`], start);
    }

    const boardIds = config.boardIds as string[] | undefined;
    if (!boardIds || boardIds.length === 0) {
      return buildIngestResult(0, 0, ['No boardIds provided in config'], start);
    }

    const headers = { Authorization: `Bearer ${apiKey}` };

    let totalNodesAdded = 0;
    let totalEdgesAdded = 0;
    const errors: string[] = [];

    for (const boardId of boardIds) {
      try {
        const counts = await this.processBoard(store, baseUrl, boardId, headers);
        totalNodesAdded += counts.nodesAdded;
        totalEdgesAdded += counts.edgesAdded;
      } catch (err) {
        errors.push(
          `Miro API error for board ${boardId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return buildIngestResult(totalNodesAdded, totalEdgesAdded, errors, start);
  }

  private async processBoard(
    store: GraphStore,
    baseUrl: string,
    boardId: string,
    headers: Record<string, string>
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    let nodesAdded = 0;
    let edgesAdded = 0;

    // Fetch board metadata
    const boardResponse = await this.httpClient(`${baseUrl}/v2/boards/${boardId}`, { headers });
    if (!boardResponse.ok) throw new Error(`Failed to fetch board ${boardId}`);
    const board = (await boardResponse.json()) as MiroBoard;

    // Create document node for the board
    const boardNodeId = `miro:board:${boardId}`;
    store.addNode({
      id: boardNodeId,
      type: 'document',
      name: sanitizeExternalText(board.name, 500),
      content: sanitizeExternalText(board.description ?? '', 2000),
      metadata: {
        source: 'miro',
        boardId: board.id,
      },
    });
    nodesAdded++;

    // Fetch board items
    const itemsResponse = await this.httpClient(`${baseUrl}/v2/boards/${boardId}/items`, {
      headers,
    });
    if (!itemsResponse.ok) throw new Error(`Failed to fetch items for board ${boardId}`);
    const itemsData = (await itemsResponse.json()) as MiroItemsResponse;

    for (const item of itemsData.data) {
      const rawContent = item.data?.content ?? '';
      const plainContent = stripHtml(rawContent);

      if (plainContent.length < MIN_CONTENT_LENGTH) continue;
      if (!CONCEPT_ITEM_TYPES.has(item.type)) continue;

      const itemNodeId = `miro:item:${item.id}`;
      store.addNode({
        id: itemNodeId,
        type: 'business_concept',
        name: sanitizeExternalText(plainContent, 500),
        content: sanitizeExternalText(plainContent, 2000),
        metadata: {
          source: 'miro',
          boardId: board.id,
          itemType: item.type,
        },
      });
      nodesAdded++;

      // Link board to item
      store.addEdge({ from: boardNodeId, to: itemNodeId, type: 'contains' });
      edgesAdded++;

      // Link item to matching code nodes
      edgesAdded += linkToCode(store, plainContent, itemNodeId, 'documents');
    }

    return { nodesAdded, edgesAdded };
  }
}
