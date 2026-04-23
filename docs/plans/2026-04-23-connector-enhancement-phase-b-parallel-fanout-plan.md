# Plan: Connector Enhancement Phase B -- Parallel Fan-Out

**Date:** 2026-04-23 | **Spec:** docs/changes/connector-enhancement/proposal.md | **Tasks:** 4 | **Time:** ~20 min

## Goal

Enhance the Confluence and Slack connectors to extract richer business knowledge signals (page hierarchy/labels, thread replies, reactions) and wire assembled content through the Phase A `condenseContent()` pipeline. The Jira connector enhancement (comments, AC parser, custom fields, condenseContent) was completed during Phase A execution and is already in production with passing tests.

## Observable Truths (Acceptance Criteria)

### Jira Connector (ALREADY COMPLETE)

_The following are verified complete. Source: `JiraConnector.ts` and `JiraConnector.test.ts` on branch `feat/phase-2-code-signal--7c3a728d`. 8 tests passing._

1. ~~Jira fetches comments via `/rest/api/2/issue/{key}/comment`~~
2. ~~Acceptance criteria parsed from description into `metadata.acceptanceCriteria`~~
3. ~~Custom fields extracted into `metadata.customFields`~~
4. ~~Assembled content runs through `condenseContent()` with 4000 default~~
5. ~~`metadata.commentCount` set on issue nodes~~
6. ~~condensed/originalLength metadata set when content is truncated/summarized~~

### Confluence Connector

7. When a page has ancestors, a `contains` edge is created from the parent document node to the child document node (EARS: Event-driven)
8. Page labels from `page.metadata.labels.results[].name` are stored as `metadata.labels: string[]` (EARS: Event-driven)
9. Full page body content runs through `condenseContent()` at 8000-char default limit (EARS: Event-driven)
10. `metadata.parentPageId?: string` is set when a page has ancestors (EARS: Event-driven)
11. Fetch URL includes expansion for ancestors and labels alongside existing `body-format=storage` (EARS: Ubiquitous)
12. When condenseContent truncates or summarizes, `metadata.condensed` and `metadata.originalLength` are set on the document node (EARS: Event-driven)
13. Pages with no ancestors do not have `parentPageId` set and no `contains` edge is created (EARS: Unwanted)

### Slack Connector

14. When a message has `reply_count > 0`, thread replies are fetched via `conversations.replies` and concatenated (chronological, author-prefixed) into the conversation node content (EARS: Event-driven)
15. Reaction counts from `message.reactions[]` are stored as `metadata.reactions: Record<string, number>` (EARS: Event-driven)
16. `metadata.threadReplyCount?: number` is set when a message has thread replies (EARS: Event-driven)
17. Assembled content (message + replies) runs through `condenseContent()` with `maxContentLength` defaulting to 2000 (EARS: Event-driven)
18. When condenseContent truncates or summarizes, `metadata.condensed` and `metadata.originalLength` are set on the conversation node (EARS: Event-driven)
19. Messages without `reply_count` do not trigger `conversations.replies` API calls (EARS: Unwanted)
20. Messages without `reactions` do not have `reactions` metadata set (EARS: Unwanted)

### Cross-cutting

21. All existing connector tests continue to pass with no modifications to test expectations (EARS: Ubiquitous)
22. `npx vitest run tests/ingest/connectors/` passes for all new and existing connector tests (EARS: Ubiquitous)

## Uncertainties

- [ASSUMPTION] The Confluence API v2 supports `expand=ancestors,metadata.labels` as additional query parameters alongside the existing `body-format=storage`. The current URL (`/wiki/api/v2/pages?spaceKey=...&limit=25&body-format=storage`) will be extended with `&expand=ancestors,metadata.labels`. If the v2 API uses different expansion syntax, the parameter name may need adjustment, but the mock tests will pass regardless.
- [ASSUMPTION] The Slack `conversations.history` response includes `reply_count` and `reactions` fields on message objects. The existing `SlackMessage` interface will be extended with these optional fields. The Slack API documentation confirms these fields are present.
- [ASSUMPTION] Making `processPage` async is safe since `ingest()` is already async and `fetchAllPages` operates in an async loop. The existing 4 Confluence tests will continue to pass because the new fields (ancestors, metadata.labels) are optional in the enhanced `ConfluencePage` interface.
- [ASSUMPTION] Slack `conversations.replies` returns the parent message as the first element in the `messages` array. We slice it off to avoid duplicating the parent text in the content.
- [DEFERRABLE] Exact author display format in concatenated thread replies (we use `[user_id]: text` since Slack messages use user IDs, not display names).

## File Map

```
MODIFY packages/graph/src/ingest/connectors/ConfluenceConnector.ts
MODIFY packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts
MODIFY packages/graph/src/ingest/connectors/SlackConnector.ts
MODIFY packages/graph/tests/ingest/connectors/SlackConnector.test.ts
```

## Tasks

### Task 1: Confluence Connector -- write tests for ancestors, labels, contains edges, condenseContent (TDD red)

**Depends on:** none (Phase A complete) | **Files:** `packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts`

This task can run in parallel with Tasks 3-4 (Slack).

1. Open `packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts`. Add the following test cases inside the main `describe('ConfluenceConnector', ...)` block, after the existing 4 tests (after line 108, before the closing `});`):

```typescript
describe('page hierarchy (contains edges)', () => {
  it('creates contains edge from parent to child when ancestors exist', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const hierarchyFixture = {
      results: [
        {
          id: '200',
          title: 'Child Page',
          status: 'current',
          body: { storage: { value: 'Child content' } },
          ancestors: [
            { id: '100', title: 'Root' },
            { id: '150', title: 'Parent' },
          ],
          metadata: { labels: { results: [] } },
          _links: { webui: '/wiki/spaces/DEV/pages/200' },
        },
      ],
      _links: { next: null },
    };

    // Pre-create parent node so contains edge target exists
    store.addNode({
      id: 'confluence:150',
      type: 'document',
      name: 'Parent',
      metadata: { source: 'confluence' },
    });

    const connector = new ConfluenceConnector(makeMockHttpClient(hierarchyFixture));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    expect(result.nodesAdded).toBe(1);

    // Check contains edge from parent to child
    const edges = store.getEdges({
      from: 'confluence:150',
      to: 'confluence:200',
      type: 'contains',
    });
    expect(edges).toHaveLength(1);

    // Check parentPageId metadata
    const node = store.getNode('confluence:200');
    expect(node!.metadata.parentPageId).toBe('150');
  });

  it('does not create contains edge when no ancestors', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const noAncestorFixture = {
      results: [
        {
          id: '300',
          title: 'Root Page',
          status: 'current',
          body: { storage: { value: 'Root content' } },
          ancestors: [],
          metadata: { labels: { results: [] } },
          _links: { webui: '/wiki/spaces/DEV/pages/300' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(noAncestorFixture));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('confluence:300');
    expect(node!.metadata.parentPageId).toBeUndefined();
  });
});

describe('labels extraction', () => {
  it('extracts page labels into metadata', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const labelFixture = {
      results: [
        {
          id: '400',
          title: 'Tagged Page',
          status: 'current',
          body: { storage: { value: 'Tagged content' } },
          ancestors: [],
          metadata: {
            labels: {
              results: [
                { name: 'architecture', id: '1' },
                { name: 'api-design', id: '2' },
              ],
            },
          },
          _links: { webui: '/wiki/spaces/DEV/pages/400' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(labelFixture));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:400');
    expect(node).not.toBeNull();
    const labels = node!.metadata.labels as string[];
    expect(labels).toEqual(['architecture', 'api-design']);
  });

  it('returns empty labels array when page has no labels', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const noLabelFixture = {
      results: [
        {
          id: '500',
          title: 'No Labels Page',
          status: 'current',
          body: { storage: { value: 'Content' } },
          ancestors: [],
          metadata: { labels: { results: [] } },
          _links: { webui: '/wiki/spaces/DEV/pages/500' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(noLabelFixture));
    await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:500');
    expect((node!.metadata.labels as string[]).length).toBe(0);
  });
});

describe('condenseContent wiring', () => {
  it('condenses long page content and sets metadata', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const longContent = 'Architecture decision details: '.repeat(500); // ~15500 chars
    const longPageFixture = {
      results: [
        {
          id: '600',
          title: 'Long Page',
          status: 'current',
          body: { storage: { value: longContent } },
          ancestors: [],
          metadata: { labels: { results: [] } },
          _links: { webui: '/wiki/spaces/DEV/pages/600' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(longPageFixture));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:600');
    expect(node).not.toBeNull();
    expect(node!.metadata.condensed).toBe('truncated');
    expect(node!.metadata.originalLength).toBeGreaterThan(8000);
    expect(node!.content!.length).toBeLessThanOrEqual(8001); // 8000 + ellipsis
  });

  it('uses default maxContentLength of 8000', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const longContent = 'x'.repeat(10000);
    const longPageFixture = {
      results: [
        {
          id: '700',
          title: 'Default Limit',
          status: 'current',
          body: { storage: { value: longContent } },
          ancestors: [],
          metadata: { labels: { results: [] } },
          _links: { webui: '/wiki/spaces/DEV/pages/700' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(longPageFixture));
    // No maxContentLength -- should use 8000 default
    await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:700');
    expect(node!.metadata.condensed).toBe('truncated');
    expect(node!.content!.length).toBeLessThanOrEqual(8001);
  });

  it('passes through short content without condensing', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const connector = new ConfluenceConnector(makeMockHttpClient(CONFLUENCE_FIXTURE));
    await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:123');
    expect(node!.metadata.condensed).toBeUndefined();
  });
});
```

2. Run the tests -- observe failures for the new tests (connector does not yet implement ancestors/labels/condenseContent):

```bash
cd packages/graph && npx vitest run tests/ingest/connectors/ConfluenceConnector.test.ts --reporter=verbose 2>&1 | tail -30
```

3. Commit: `test(graph): add Confluence Connector enhancement tests for hierarchy, labels, condenseContent`

---

### Task 2: Confluence Connector -- implement ancestors, labels, contains edges, condenseContent (TDD green)

**Depends on:** Task 1 | **Files:** `packages/graph/src/ingest/connectors/ConfluenceConnector.ts`

1. Replace the full contents of `packages/graph/src/ingest/connectors/ConfluenceConnector.ts` with:

```typescript
import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';
import { condenseContent } from './ContentCondenser.js';

const CONFLUENCE_DEFAULT_MAX_CONTENT_LENGTH = 8000;

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

interface ConfluenceAncestor {
  id: string;
  title?: string;
}

interface ConfluenceLabelResult {
  name: string;
  id?: string;
}

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  body?: { storage?: { value?: string } };
  ancestors?: ConfluenceAncestor[];
  metadata?: {
    labels?: {
      results?: ConfluenceLabelResult[];
    };
  };
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
    const counts = await this.fetchAllPagesHandled(
      store,
      baseUrl,
      apiKey,
      spaceKey,
      config,
      errors
    );

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
    config: ConnectorConfig,
    errors: string[]
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    try {
      const result = await this.fetchAllPages(store, baseUrl, apiKey, spaceKey, config);
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
    spaceKey: string,
    config: ConnectorConfig
  ): Promise<{ nodesAdded: number; edgesAdded: number; errors: string[] }> {
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let nextUrl: string | null =
      `${baseUrl}/wiki/api/v2/pages?spaceKey=${encodeURIComponent(spaceKey)}&limit=25&body-format=storage&expand=ancestors,metadata.labels`;

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
        const counts = await this.processPage(store, page, spaceKey, config);
        nodesAdded += counts.nodesAdded;
        edgesAdded += counts.edgesAdded;
      }

      nextUrl = data._links?.next ? `${baseUrl}${data._links.next}` : null;
    }

    return { nodesAdded, edgesAdded, errors };
  }

  private async processPage(
    store: GraphStore,
    page: ConfluencePage,
    spaceKey: string,
    config: ConnectorConfig
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    let edgesAdded = 0;

    // Extract labels
    const labels: string[] = page.metadata?.labels?.results?.map((l) => l.name) ?? [];

    // Determine parent page from ancestors (last ancestor is direct parent)
    const ancestors = page.ancestors ?? [];
    const parentPageId = ancestors.length > 0 ? ancestors[ancestors.length - 1].id : undefined;

    // Full body content through condenseContent
    const bodyContent = page.body?.storage?.value ?? '';
    const fullContent = `${page.title}\n${bodyContent}`;
    const maxContentLength =
      (config.maxContentLength as number | undefined) ?? CONFLUENCE_DEFAULT_MAX_CONTENT_LENGTH;
    const condensed = await condenseContent(fullContent, { maxLength: maxContentLength });

    const nodeId = `confluence:${page.id}`;
    store.addNode({
      id: nodeId,
      type: 'document',
      name: sanitizeExternalText(page.title, 500),
      content: condensed.content,
      metadata: {
        source: 'confluence',
        spaceKey,
        pageId: page.id,
        status: page.status,
        url: page._links?.webui ?? '',
        labels,
        ...(parentPageId ? { parentPageId } : {}),
        ...(condensed.method !== 'passthrough'
          ? { condensed: condensed.method, originalLength: condensed.originalLength }
          : {}),
      },
    });

    // Create contains edge from parent to child
    if (parentPageId) {
      const parentNodeId = `confluence:${parentPageId}`;
      store.addEdge({ from: parentNodeId, to: nodeId, type: 'contains' });
      edgesAdded++;
    }

    const text = sanitizeExternalText(`${page.title} ${bodyContent}`);
    edgesAdded += linkToCode(store, text, nodeId, 'documents');

    return { nodesAdded: 1, edgesAdded };
  }
}
```

**Key changes from the original:**

- Line 5: Added `import { condenseContent } from './ContentCondenser.js';`
- Line 7: Added `CONFLUENCE_DEFAULT_MAX_CONTENT_LENGTH = 8000` constant
- Lines 27-38: Added `ConfluenceAncestor` and `ConfluenceLabelResult` interfaces
- Lines 42-48: Extended `ConfluencePage` interface with optional `ancestors` and `metadata.labels` fields
- Line 84: Added `config` parameter to `fetchAllPagesHandled`
- Line 91: Added `config` parameter to `fetchAllPages`
- Line 104: Added `&expand=ancestors,metadata.labels` to the fetch URL
- Lines 115-116: `processPage` is now `async` and accepts `config` parameter
- Lines 123-133: Added labels extraction, parent page ID resolution, condenseContent wiring
- Lines 143-148: Added parentPageId and condensed metadata to node
- Lines 152-156: Added `contains` edge creation from parent to child

2. Run the tests -- observe all pass (existing 4 + new 7):

```bash
cd packages/graph && npx vitest run tests/ingest/connectors/ConfluenceConnector.test.ts --reporter=verbose 2>&1 | tail -30
```

3. Commit: `feat(graph): enhance ConfluenceConnector with hierarchy edges, labels, condenseContent`

---

### Task 3: Slack Connector -- write tests for thread replies, reactions, condenseContent (TDD red)

**Depends on:** none (Phase A complete) | **Files:** `packages/graph/tests/ingest/connectors/SlackConnector.test.ts`

This task can run in parallel with Tasks 1-2 (Confluence).

1. Open `packages/graph/tests/ingest/connectors/SlackConnector.test.ts`. Add the following imports after line 4:

```typescript
import type { HttpClient } from '../../../src/ingest/connectors/ConnectorInterface.js';
```

2. Add the following fixtures and helpers after the `SLACK_FIXTURE` constant (after line 13):

```typescript
// Thread fixture: parent message with replies and reactions
const SLACK_THREAD_FIXTURE = {
  ok: true,
  messages: [
    {
      text: 'Should we implement rate limiting?',
      user: 'U100',
      ts: '1700000000.000001',
      reply_count: 2,
      reactions: [
        { name: '+1', count: 5 },
        { name: 'white_check_mark', count: 3 },
      ],
    },
    {
      text: 'Simple message no replies',
      user: 'U200',
      ts: '1700000000.000002',
    },
  ],
};

const SLACK_REPLIES_FIXTURE = {
  ok: true,
  messages: [
    {
      text: 'Should we implement rate limiting?',
      user: 'U100',
      ts: '1700000000.000001',
    },
    {
      text: 'Yes, we must limit to 100 req/min',
      user: 'U101',
      ts: '1700000000.000003',
    },
    {
      text: 'Agreed, let us use token bucket algorithm',
      user: 'U102',
      ts: '1700000000.000004',
    },
  ],
};

function makeRoutingSlackMockClient(
  historyResponse: unknown,
  repliesResponse: unknown
): HttpClient {
  return async (url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => {
      if (url.includes('conversations.replies')) return repliesResponse;
      return historyResponse;
    },
  });
}
```

3. Add the following test cases inside the main `describe('SlackConnector', ...)` block, after the existing 4 tests (after line 103, before the closing `});`):

```typescript
describe('thread replies', () => {
  it('fetches and concatenates thread replies into parent message content', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(
      makeRoutingSlackMockClient(SLACK_THREAD_FIXTURE, SLACK_REPLIES_FIXTURE)
    );
    const config: ConnectorConfig = { channels: ['C123'] };
    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Threaded message should contain replies
    const threadNode = store.getNode('conversation:slack:C123:1700000000.000001');
    expect(threadNode).not.toBeNull();
    expect(threadNode!.content).toContain('100 req/min');
    expect(threadNode!.content).toContain('token bucket');
    expect(threadNode!.metadata.threadReplyCount).toBe(2);
  });

  it('does not fetch replies for messages without reply_count', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    let repliesCalled = false;
    const trackingClient: HttpClient = async (url, _options) => ({
      ok: true as const,
      json: async () => {
        if (url.includes('conversations.replies')) {
          repliesCalled = true;
          return SLACK_REPLIES_FIXTURE;
        }
        return {
          ok: true,
          messages: [{ text: 'No replies here', user: 'U999', ts: '1700000000.000099' }],
        };
      },
    });

    const connector = new SlackConnector(trackingClient);
    await connector.ingest(store, { channels: ['C123'] });

    expect(repliesCalled).toBe(false);
  });
});

describe('reactions extraction', () => {
  it('extracts reaction counts into metadata', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(
      makeRoutingSlackMockClient(SLACK_THREAD_FIXTURE, SLACK_REPLIES_FIXTURE)
    );
    const result = await connector.ingest(store, { channels: ['C123'] });

    const node = store.getNode('conversation:slack:C123:1700000000.000001');
    expect(node).not.toBeNull();
    const reactions = node!.metadata.reactions as Record<string, number>;
    expect(reactions).toEqual({ '+1': 5, white_check_mark: 3 });
  });

  it('does not set reactions metadata when message has no reactions', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(
      makeRoutingSlackMockClient(SLACK_THREAD_FIXTURE, SLACK_REPLIES_FIXTURE)
    );
    await connector.ingest(store, { channels: ['C123'] });

    const node = store.getNode('conversation:slack:C123:1700000000.000002');
    expect(node).not.toBeNull();
    expect(node!.metadata.reactions).toBeUndefined();
  });
});

describe('condenseContent wiring', () => {
  it('condenses long threaded content and sets metadata', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const longReplies = {
      ok: true,
      messages: [
        { text: 'Original question', user: 'U100', ts: '1700000000.000001' },
        ...Array.from({ length: 50 }, (_, i) => ({
          text: `Detailed reply ${i}: ${'business context '.repeat(20)}`,
          user: `U${200 + i}`,
          ts: `1700000000.${String(i + 10).padStart(6, '0')}`,
        })),
      ],
    };

    const longThreadFixture = {
      ok: true,
      messages: [
        {
          text: 'Discussion about architecture',
          user: 'U100',
          ts: '1700000000.000001',
          reply_count: 50,
        },
      ],
    };

    const connector = new SlackConnector(
      makeRoutingSlackMockClient(longThreadFixture, longReplies)
    );
    const result = await connector.ingest(store, {
      channels: ['C123'],
      maxContentLength: 2000,
    });

    const node = store.getNode('conversation:slack:C123:1700000000.000001');
    expect(node).not.toBeNull();
    expect(node!.metadata.condensed).toBe('truncated');
    expect(node!.metadata.originalLength).toBeGreaterThan(2000);
    expect(node!.content!.length).toBeLessThanOrEqual(2001);
  });

  it('uses default maxContentLength of 2000', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const longReplies = {
      ok: true,
      messages: [
        { text: 'Start', user: 'U100', ts: '1700000000.000001' },
        { text: 'x'.repeat(3000), user: 'U101', ts: '1700000000.000002' },
      ],
    };

    const longThreadFixture = {
      ok: true,
      messages: [{ text: 'Thread start', user: 'U100', ts: '1700000000.000001', reply_count: 1 }],
    };

    const connector = new SlackConnector(
      makeRoutingSlackMockClient(longThreadFixture, longReplies)
    );
    // No maxContentLength -- should use 2000 default
    await connector.ingest(store, { channels: ['C123'] });

    const node = store.getNode('conversation:slack:C123:1700000000.000001');
    expect(node!.metadata.condensed).toBe('truncated');
    expect(node!.content!.length).toBeLessThanOrEqual(2001);
  });

  it('passes through short content without condensing', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(makeMockHttpClient(SLACK_FIXTURE));
    await connector.ingest(store, { channels: ['C123'] });

    const node = store.getNode('conversation:slack:C123:1234567890.123456');
    expect(node!.metadata.condensed).toBeUndefined();
  });
});
```

4. Run the tests -- observe failures for the new tests (connector does not yet implement replies/reactions/condenseContent):

```bash
cd packages/graph && npx vitest run tests/ingest/connectors/SlackConnector.test.ts --reporter=verbose 2>&1 | tail -30
```

5. Commit: `test(graph): add Slack Connector enhancement tests for thread replies, reactions, condenseContent`

---

### Task 4: Slack Connector -- implement thread replies, reactions, condenseContent (TDD green)

**Depends on:** Task 3 | **Files:** `packages/graph/src/ingest/connectors/SlackConnector.ts`

1. Replace the full contents of `packages/graph/src/ingest/connectors/SlackConnector.ts` with:

```typescript
import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';
import { condenseContent } from './ContentCondenser.js';

const SLACK_DEFAULT_MAX_CONTENT_LENGTH = 2000;

interface SlackReaction {
  name: string;
  count: number;
}

interface SlackMessage {
  text: string;
  user: string;
  ts: string;
  reply_count?: number;
  reactions?: SlackReaction[];
}

interface SlackResponse {
  ok: boolean;
  messages: SlackMessage[];
}

export class SlackConnector implements GraphConnector {
  readonly name = 'slack';
  readonly source = 'slack';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'SLACK_API_KEY';
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

    const channels = (config.channels ?? []) as string[];

    // S-1: Time filtering via lookbackDays
    const oldest = config.lookbackDays
      ? String(Math.floor((Date.now() - Number(config.lookbackDays) * 86400000) / 1000))
      : undefined;

    for (const channel of channels) {
      try {
        const result = await this.processChannel(store, channel, apiKey, oldest, config);
        nodesAdded += result.nodesAdded;
        edgesAdded += result.edgesAdded;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(
          `Slack API error for channel ${channel}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
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

  /**
   * Fetch thread replies for a message with reply_count > 0.
   * The Slack API returns the parent message as the first element;
   * we slice it off to return only reply messages.
   */
  private async fetchReplies(
    channel: string,
    threadTs: string,
    apiKey: string
  ): Promise<SlackMessage[]> {
    try {
      const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(threadTs)}`;
      const response = await this.httpClient(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];
      const data = (await response.json()) as SlackResponse;
      if (!data.ok) return [];

      // First message in replies is the parent -- skip it, return only replies
      return data.messages.slice(1);
    } catch {
      return [];
    }
  }

  private async processChannel(
    store: GraphStore,
    channel: string,
    apiKey: string,
    oldest: string | undefined,
    config: ConnectorConfig
  ): Promise<{ nodesAdded: number; edgesAdded: number; errors: string[] }> {
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}`;
    if (oldest) {
      url += `&oldest=${oldest}`;
    }
    const response = await this.httpClient(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        nodesAdded: 0,
        edgesAdded: 0,
        errors: [`Slack API request failed for channel ${channel}`],
      };
    }

    const data = (await response.json()) as SlackResponse;
    if (!data.ok) {
      return { nodesAdded: 0, edgesAdded: 0, errors: [`Slack API error for channel ${channel}`] };
    }

    const maxContentLength =
      (config.maxContentLength as number | undefined) ?? SLACK_DEFAULT_MAX_CONTENT_LENGTH;

    for (const message of data.messages) {
      // Build content: original message + thread replies
      const parts: string[] = [message.text];

      let threadReplyCount: number | undefined;
      if (message.reply_count && message.reply_count > 0) {
        const replies = await this.fetchReplies(channel, message.ts, apiKey);
        threadReplyCount = replies.length;
        if (replies.length > 0) {
          const replyLines = replies.map((r) => `[${r.user}]: ${r.text}`);
          parts.push('\n## Thread Replies\n' + replyLines.join('\n'));
        }
      }

      const assembledContent = parts.join('\n').trim();

      // Run through condenseContent
      const condensed = await condenseContent(assembledContent, { maxLength: maxContentLength });

      // Extract reactions
      let reactions: Record<string, number> | undefined;
      if (message.reactions && message.reactions.length > 0) {
        reactions = {};
        for (const r of message.reactions) {
          reactions[r.name] = r.count;
        }
      }

      const nodeId = `conversation:slack:${channel}:${message.ts}`;
      const sanitizedText = sanitizeExternalText(message.text);
      const snippet = sanitizedText.length > 100 ? sanitizedText.slice(0, 100) : sanitizedText;

      store.addNode({
        id: nodeId,
        type: 'conversation',
        name: snippet,
        content: condensed.content,
        metadata: {
          author: message.user,
          channel,
          timestamp: message.ts,
          ...(threadReplyCount !== undefined ? { threadReplyCount } : {}),
          ...(reactions ? { reactions } : {}),
          ...(condensed.method !== 'passthrough'
            ? { condensed: condensed.method, originalLength: condensed.originalLength }
            : {}),
        },
      });
      nodesAdded++;

      edgesAdded += linkToCode(
        store,
        sanitizeExternalText(assembledContent),
        nodeId,
        'references',
        {
          checkPaths: true,
        }
      );
    }

    return { nodesAdded, edgesAdded, errors };
  }
}
```

**Key changes from the original:**

- Line 5: Added `import { condenseContent } from './ContentCondenser.js';`
- Line 7: Added `SLACK_DEFAULT_MAX_CONTENT_LENGTH = 2000` constant
- Lines 9-13: Added `SlackReaction` interface
- Lines 17-18: Extended `SlackMessage` with optional `reply_count` and `reactions` fields
- Lines 94-116: New `fetchReplies()` method that calls `conversations.replies` API
- Line 119: `processChannel` now accepts `config` parameter
- Lines 142-143: Added `maxContentLength` resolution from config with 2000 default
- Lines 146-157: Thread reply fetching and content assembly
- Lines 160-161: `condenseContent()` wiring
- Lines 164-170: Reaction extraction into `Record<string, number>`
- Lines 178-183: New metadata fields (threadReplyCount, reactions, condensed, originalLength)

2. Run the tests -- observe all pass (existing 4 + new 9):

```bash
cd packages/graph && npx vitest run tests/ingest/connectors/SlackConnector.test.ts --reporter=verbose 2>&1 | tail -30
```

3. Run full connector test suite to verify no regressions across all connectors:

```bash
cd packages/graph && npx vitest run tests/ingest/connectors/ --reporter=verbose 2>&1 | tail -40
```

4. Commit: `feat(graph): enhance SlackConnector with thread replies, reactions, condenseContent`

## Dependencies Graph

```
Task 1 (Confluence tests)        Task 3 (Slack tests)
        |                               |
        v                               v
Task 2 (Confluence impl)        Task 4 (Slack impl)
```

**Parallel opportunities:** The Confluence track (Tasks 1-2) and Slack track (Tasks 3-4) are fully independent and can execute in parallel. Within each track, the test task must precede the implementation task (TDD red then green).

## Traceability

| Observable Truth                             | Delivered By                         |
| -------------------------------------------- | ------------------------------------ |
| 1-6 (Jira)                                   | ALREADY COMPLETE (Phase A execution) |
| 7 (contains edge parent-to-child)            | Task 2                               |
| 8 (labels metadata)                          | Task 2                               |
| 9 (Confluence condenseContent at 8000)       | Task 2                               |
| 10 (parentPageId metadata)                   | Task 2                               |
| 11 (expand ancestors,labels in URL)          | Task 2                               |
| 12 (Confluence condensed/originalLength)     | Task 2                               |
| 13 (no contains edge when no ancestors)      | Task 2                               |
| 14 (thread replies in content)               | Task 4                               |
| 15 (reactions metadata)                      | Task 4                               |
| 16 (threadReplyCount metadata)               | Task 4                               |
| 17 (Slack condenseContent at 2000)           | Task 4                               |
| 18 (Slack condensed/originalLength)          | Task 4                               |
| 19 (no replies fetch without reply_count)    | Task 4                               |
| 20 (no reactions metadata without reactions) | Task 4                               |
| 21 (existing tests pass)                     | Tasks 2, 4                           |
| 22 (all connector tests pass)                | Tasks 2, 4                           |
