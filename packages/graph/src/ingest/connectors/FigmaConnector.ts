import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText, withRetry } from './ConnectorUtils.js';
import { condenseContent } from './ContentCondenser.js';

interface FigmaStyle {
  key: string;
  name: string;
  style_type: string;
  description: string;
}

interface FigmaStylesResponse {
  meta: { styles: FigmaStyle[] };
}

interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

interface FigmaComponentsResponse {
  meta: { components: FigmaComponent[] };
}

/** Keywords that indicate a component carries a design constraint. */
const CONSTRAINT_KEYWORDS = [
  'constraint',
  'must',
  'required',
  'minimum',
  'maximum',
  'spacing',
  'padding',
  'margin',
  'breakpoint',
  'responsive',
  'accessible',
  'a11y',
  'wcag',
] as const;

function hasConstraintKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSTRAINT_KEYWORDS.some((kw) => lower.includes(kw));
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

export class FigmaConnector implements GraphConnector {
  readonly name = 'figma';
  readonly source = 'figma';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? withRetry((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();

    const apiKeyEnv = config.apiKeyEnv ?? 'FIGMA_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return buildIngestResult(
        0,
        0,
        [`Missing API key: environment variable "${apiKeyEnv}" is not set`],
        start
      );
    }

    const baseUrlEnv = config.baseUrlEnv ?? 'FIGMA_BASE_URL';
    const baseUrl = process.env[baseUrlEnv] ?? 'https://api.figma.com';

    const fileIds = config.fileIds as string[] | undefined;
    if (!fileIds || fileIds.length === 0) {
      return buildIngestResult(0, 0, ['No fileIds provided in connector config'], start);
    }

    const headers = { 'X-FIGMA-TOKEN': apiKey };
    const maxLen = (config.maxContentLength as number | undefined) ?? 4000;

    let nodesAdded = 0;
    let edgesAdded = 0;
    const errors: string[] = [];

    for (const fileId of fileIds) {
      try {
        const counts = await this.processFile(store, baseUrl, fileId, headers, maxLen);
        nodesAdded += counts.nodesAdded;
        edgesAdded += counts.edgesAdded;
      } catch (err) {
        errors.push(
          `Figma API error for file ${fileId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return buildIngestResult(nodesAdded, edgesAdded, errors, start);
  }

  private async processFile(
    store: GraphStore,
    baseUrl: string,
    fileId: string,
    headers: Record<string, string>,
    maxLen: number
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    let nodesAdded = 0;
    let edgesAdded = 0;

    // Fetch styles
    const stylesUrl = `${baseUrl}/v1/files/${fileId}/styles`;
    const stylesResponse = await this.httpClient(stylesUrl, { headers });
    if (!stylesResponse.ok) throw new Error(`Styles request failed for file ${fileId}`);
    const stylesData = (await stylesResponse.json()) as FigmaStylesResponse;

    for (const style of stylesData.meta.styles) {
      const nodeId = `figma:token:${style.key}`;
      const condensed = await condenseContent(sanitizeExternalText(style.description || '', 2000), {
        maxLength: maxLen,
      });

      const metadata: Record<string, unknown> = {
        key: style.key,
        styleType: style.style_type,
        fileId,
      };

      if (condensed.method !== 'passthrough') {
        metadata.condensed = condensed.method;
        metadata.originalLength = condensed.originalLength;
      }

      store.addNode({
        id: nodeId,
        type: 'design_token',
        name: sanitizeExternalText(style.name, 500),
        content: condensed.content,
        metadata,
      });
      nodesAdded++;

      const searchText = sanitizeExternalText([style.name, style.description].join(' '));
      edgesAdded += linkToCode(store, searchText, nodeId, 'references');
    }

    // Fetch components
    const componentsUrl = `${baseUrl}/v1/files/${fileId}/components`;
    const componentsResponse = await this.httpClient(componentsUrl, { headers });
    if (!componentsResponse.ok) throw new Error(`Components request failed for file ${fileId}`);
    const componentsData = (await componentsResponse.json()) as FigmaComponentsResponse;

    for (const component of componentsData.meta.components) {
      const description = component.description || '';

      // Create aesthetic_intent node for every component with a description
      if (description) {
        const intentId = `figma:intent:${component.key}`;
        const condensed = await condenseContent(sanitizeExternalText(description, 2000), {
          maxLength: maxLen,
        });

        const metadata: Record<string, unknown> = {
          key: component.key,
          fileId,
        };

        if (condensed.method !== 'passthrough') {
          metadata.condensed = condensed.method;
          metadata.originalLength = condensed.originalLength;
        }

        store.addNode({
          id: intentId,
          type: 'aesthetic_intent',
          name: sanitizeExternalText(component.name, 500),
          content: condensed.content,
          metadata,
        });
        nodesAdded++;

        const searchText = sanitizeExternalText([component.name, description].join(' '));
        edgesAdded += linkToCode(store, searchText, intentId, 'references');
      }

      // Create design_constraint node when description has constraint keywords
      if (description && hasConstraintKeyword(description)) {
        const constraintId = `figma:constraint:${component.key}`;
        const condensed = await condenseContent(sanitizeExternalText(description, 2000), {
          maxLength: maxLen,
        });

        const metadata: Record<string, unknown> = {
          key: component.key,
          fileId,
        };

        if (condensed.method !== 'passthrough') {
          metadata.condensed = condensed.method;
          metadata.originalLength = condensed.originalLength;
        }

        store.addNode({
          id: constraintId,
          type: 'design_constraint',
          name: sanitizeExternalText(component.name, 500),
          content: condensed.content,
          metadata,
        });
        nodesAdded++;

        const searchText = sanitizeExternalText([component.name, description].join(' '));
        edgesAdded += linkToCode(store, searchText, constraintId, 'references');
      }
    }

    return { nodesAdded, edgesAdded };
  }
}
