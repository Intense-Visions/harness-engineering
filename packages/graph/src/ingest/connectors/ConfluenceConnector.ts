import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';

function missingApiKeyResult(envVar: string, start: number): IngestResult {
  return {
    nodesAdded: 0,
    nodesUpdated: 0,
    edgesAdded: 0,
    edgesUpdated: 0,
    errors: [`Missing API key: environment variable "${envVar}" is not set`],
    durationMs: Date.now() - start,
  };
}

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  body?: { storage?: { value?: string } };
  _links?: { webui?: string };
}

interface ConfluenceResponse {
  results: ConfluencePage[];
  _links?: { next?: string | null };
}

export class ConfluenceConnector implements GraphConnector {
  readonly name = 'confluence';
  readonly source = 'confluence';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];

    const apiKeyEnv = config.apiKeyEnv ?? 'CONFLUENCE_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return missingApiKeyResult(apiKeyEnv, start);
    }

    const baseUrlEnv = config.baseUrlEnv ?? 'CONFLUENCE_BASE_URL';
    const baseUrl = process.env[baseUrlEnv] ?? '';
    const spaceKey = (config.spaceKey as string) ?? '';
    const counts = await this.fetchAllPagesHandled(store, baseUrl, apiKey, spaceKey, errors);

    return {
      nodesAdded: counts.nodesAdded,
      nodesUpdated: 0,
      edgesAdded: counts.edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async fetchAllPagesHandled(
    store: GraphStore,
    baseUrl: string,
    apiKey: string,
    spaceKey: string,
    errors: string[]
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    try {
      const result = await this.fetchAllPages(store, baseUrl, apiKey, spaceKey);
      errors.push(...result.errors);
      return { nodesAdded: result.nodesAdded, edgesAdded: result.edgesAdded };
    } catch (err) {
      errors.push(`Confluence fetch error: ${err instanceof Error ? err.message : String(err)}`);
      return { nodesAdded: 0, edgesAdded: 0 };
    }
  }

  private async fetchAllPages(
    store: GraphStore,
    baseUrl: string,
    apiKey: string,
    spaceKey: string
  ): Promise<{ nodesAdded: number; edgesAdded: number; errors: string[] }> {
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let nextUrl: string | null =
      `${baseUrl}/wiki/api/v2/pages?spaceKey=${encodeURIComponent(spaceKey)}&limit=25&body-format=storage`;

    while (nextUrl) {
      const response = await this.httpClient(nextUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        errors.push(`Confluence API error: status ${response.status}`);
        break;
      }

      const data = (await response.json()) as ConfluenceResponse;

      for (const page of data.results) {
        const counts = this.processPage(store, page, spaceKey);
        nodesAdded += counts.nodesAdded;
        edgesAdded += counts.edgesAdded;
      }

      nextUrl = data._links?.next ? `${baseUrl}${data._links.next}` : null;
    }

    return { nodesAdded, edgesAdded, errors };
  }

  private processPage(
    store: GraphStore,
    page: ConfluencePage,
    spaceKey: string
  ): { nodesAdded: number; edgesAdded: number } {
    const nodeId = `confluence:${page.id}`;
    store.addNode({
      id: nodeId,
      type: 'document',
      name: sanitizeExternalText(page.title, 500),
      metadata: {
        source: 'confluence',
        spaceKey,
        pageId: page.id,
        status: page.status,
        url: page._links?.webui ?? '',
      },
    });

    const text = sanitizeExternalText(`${page.title} ${page.body?.storage?.value ?? ''}`);
    const edgesAdded = linkToCode(store, text, nodeId, 'documents');

    return { nodesAdded: 1, edgesAdded };
  }
}
