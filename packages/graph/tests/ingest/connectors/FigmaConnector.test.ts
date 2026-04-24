import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { FigmaConnector } from '../../../src/ingest/connectors/FigmaConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const FIGMA_STYLES_FIXTURE = {
  meta: {
    styles: [
      {
        key: 'style-color-primary',
        name: 'Colors/Primary',
        style_type: 'FILL',
        description: 'Main brand color #3B82F6',
      },
      {
        key: 'style-text-heading',
        name: 'Typography/Heading',
        style_type: 'TEXT',
        description: 'Heading text style, 24px bold',
      },
    ],
  },
};

const FIGMA_COMPONENTS_FIXTURE = {
  meta: {
    components: [
      {
        key: 'comp-btn-primary',
        name: 'Button/Primary',
        description: 'Primary CTA button with hover and focus states',
      },
      {
        key: 'comp-card-base',
        name: 'Card/Base',
        description: 'Base card component for content containers',
      },
    ],
  },
};

function makeMockHttpClient(
  stylesResponse: unknown = FIGMA_STYLES_FIXTURE,
  componentsResponse: unknown = FIGMA_COMPONENTS_FIXTURE
) {
  return async (url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => (url.includes('/styles') ? stylesResponse : componentsResponse),
  });
}

describe('FigmaConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates design_token nodes from styles', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    process.env['FIGMA_BASE_URL'] = 'https://api.figma.com';

    const connector = new FigmaConnector(makeMockHttpClient());
    const config: ConnectorConfig = { fileIds: ['file-abc'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(0);

    const tokenNode = store.getNode('figma:token:style-color-primary');
    expect(tokenNode).not.toBeNull();
    expect(tokenNode!.type).toBe('design_token');
    expect(tokenNode!.name).toBe('Colors/Primary');
    expect(tokenNode!.metadata.key).toBe('style-color-primary');
    expect(tokenNode!.metadata.styleType).toBe('FILL');

    const textNode = store.getNode('figma:token:style-text-heading');
    expect(textNode).not.toBeNull();
    expect(textNode!.type).toBe('design_token');
    expect(textNode!.name).toBe('Typography/Heading');
    expect(textNode!.metadata.styleType).toBe('TEXT');
  });

  it('creates aesthetic_intent nodes from components', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    process.env['FIGMA_BASE_URL'] = 'https://api.figma.com';

    const connector = new FigmaConnector(makeMockHttpClient());
    const config: ConnectorConfig = { fileIds: ['file-abc'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(0);

    const intentNode = store.getNode('figma:intent:comp-btn-primary');
    expect(intentNode).not.toBeNull();
    expect(intentNode!.type).toBe('aesthetic_intent');
    expect(intentNode!.name).toBe('Button/Primary');
    expect(intentNode!.metadata.key).toBe('comp-btn-primary');

    const cardNode = store.getNode('figma:intent:comp-card-base');
    expect(cardNode).not.toBeNull();
    expect(cardNode!.type).toBe('aesthetic_intent');
    expect(cardNode!.name).toBe('Card/Base');
  });

  it('returns error when FIGMA_API_KEY is missing', async () => {
    delete process.env['FIGMA_API_KEY'];

    const connector = new FigmaConnector(makeMockHttpClient());
    const result = await connector.ingest(store, { fileIds: ['file-abc'] });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('FIGMA_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('creates edges to matching code nodes', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    process.env['FIGMA_BASE_URL'] = 'https://api.figma.com';

    // Pre-populate store with a code node named "Button"
    store.addNode({
      id: 'class:Button',
      type: 'class',
      name: 'Button',
      metadata: {},
    });

    const connector = new FigmaConnector(makeMockHttpClient());
    const result = await connector.ingest(store, { fileIds: ['file-abc'] });

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

    const edges = store.getEdges({
      from: 'figma:intent:comp-btn-primary',
      to: 'class:Button',
      type: 'references',
    });
    expect(edges).toHaveLength(1);
  });

  it('reports correct ingest counts', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    process.env['FIGMA_BASE_URL'] = 'https://api.figma.com';

    const connector = new FigmaConnector(makeMockHttpClient());
    const config: ConnectorConfig = { fileIds: ['file-abc'] };

    const result = await connector.ingest(store, config);

    // 2 styles (design_token) + 2 components (aesthetic_intent) = 4 nodes
    expect(result.nodesAdded).toBe(4);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when fileIds is not provided', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';

    const connector = new FigmaConnector(makeMockHttpClient());
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('fileIds');
    expect(result.nodesAdded).toBe(0);
  });

  it('uses default base URL when FIGMA_BASE_URL is not set', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    delete process.env['FIGMA_BASE_URL'];

    let capturedUrl = '';
    const httpClient = async (url: string) => {
      capturedUrl = url;
      return {
        ok: true as const,
        json: async () =>
          url.includes('/styles') ? FIGMA_STYLES_FIXTURE : FIGMA_COMPONENTS_FIXTURE,
      };
    };

    const connector = new FigmaConnector(httpClient);
    await connector.ingest(store, { fileIds: ['file-abc'] });

    expect(capturedUrl).toContain('https://api.figma.com');
  });

  it('creates design_constraint nodes from components with constraint keywords', async () => {
    process.env['FIGMA_API_KEY'] = 'test-figma-key';
    process.env['FIGMA_BASE_URL'] = 'https://api.figma.com';

    const constraintComponents = {
      meta: {
        components: [
          {
            key: 'comp-spacing',
            name: 'Spacer/Base',
            description: 'Minimum spacing of 8px required between elements',
          },
        ],
      },
    };

    const connector = new FigmaConnector(
      makeMockHttpClient(FIGMA_STYLES_FIXTURE, constraintComponents)
    );
    const result = await connector.ingest(store, { fileIds: ['file-abc'] });

    // 2 styles + 1 aesthetic_intent + 1 design_constraint = 4 nodes
    expect(result.nodesAdded).toBe(4);

    const constraintNode = store.getNode('figma:constraint:comp-spacing');
    expect(constraintNode).not.toBeNull();
    expect(constraintNode!.type).toBe('design_constraint');
    expect(constraintNode!.name).toBe('Spacer/Base');
  });
});
