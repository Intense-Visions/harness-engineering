import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';

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
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'CONFLUENCE_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Missing API key: environment variable "${apiKeyEnv}" is not set`],
        durationMs: Date.now() - start,
      };
    }

    const baseUrlEnv = config.baseUrlEnv ?? 'CONFLUENCE_BASE_URL';
    const baseUrl = process.env[baseUrlEnv] ?? '';
    const spaceKey = (config.spaceKey as string) ?? '';

    try {
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
          nodesAdded++;

          // Link to code via keyword matching on title + body
          const text = sanitizeExternalText(`${page.title} ${page.body?.storage?.value ?? ''}`);
          edgesAdded += linkToCode(store, text, nodeId, 'documents');
        }

        // Follow pagination
        nextUrl = data._links?.next ? `${baseUrl}${data._links.next}` : null;
      }
    } catch (err) {
      errors.push(`Confluence fetch error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }
}
