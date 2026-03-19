# Writing Custom Connectors

## Overview

Connectors pull data from external systems (issue trackers, CI platforms, monitoring
services) into the knowledge graph. Each connector creates nodes for the external
entities it discovers and uses keyword matching to link them to existing code nodes.

Write a custom connector when you need to:

- Ingest data from a service not already covered (e.g., Linear, PagerDuty, Sentry).
- Enrich the graph with domain-specific metadata that generic connectors cannot provide.
- Control pagination, filtering, or authentication strategies for a private API.

## GraphConnector Interface

Every connector implements `GraphConnector` from `ConnectorInterface.ts`:

```ts
export interface GraphConnector {
  readonly name: string; // Unique identifier used as the SyncManager registry key.
  readonly source: string; // Logical source label applied to ingested nodes.
  ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult>;
}
```

`ConnectorConfig` carries runtime settings read from the project configuration:

| Field          | Type                       | Purpose                                   |
| -------------- | -------------------------- | ----------------------------------------- |
| `apiKeyEnv`    | `string?`                  | Name of the env var holding the API key.  |
| `baseUrlEnv`   | `string?`                  | Name of the env var holding the base URL. |
| `schedule`     | `string?`                  | Cron expression for automatic sync.       |
| `lookbackDays` | `number?`                  | How far back to fetch on first sync.      |
| `filters`      | `Record<string, unknown>?` | Arbitrary filter bag passed to the API.   |

`IngestResult` is returned by every `ingest` call and tracks what changed:

```ts
{
  (nodesAdded, nodesUpdated, edgesAdded, edgesUpdated, errors, durationMs);
}
```

## Step-by-Step Implementation

1. **Define response types** -- Create interfaces that mirror the API's JSON shape.
2. **Implement the class** -- Add `name`, `source`, a constructor that accepts an
   optional `HttpClient`, and the `ingest` method.
3. **Read config and validate** -- Pull env vars via `config.apiKeyEnv` / `config.baseUrlEnv`
   and return early with an error result if anything is missing.
4. **Paginate and fetch** -- Loop through API pages, calling `this.httpClient`.
5. **Add nodes** -- Call `store.addNode()` for each entity with a deterministic `id`
   (convention: `<type>:<source>:<externalKey>`).
6. **Link to code** -- Pass text content through `linkToCode` to create edges between
   external nodes and code symbols.
7. **Return the result** -- Aggregate counts and any errors into an `IngestResult`.

## HttpClient Dependency Injection

Connectors accept an optional `HttpClient` in their constructor, defaulting to the
global `fetch`. This keeps production code dependency-free while letting tests inject
a stub.

```ts
constructor(httpClient?: HttpClient) {
  this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
}
```

`HttpClient` is a minimal function type:

```ts
type HttpClient = (
  url: string,
  options?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;
```

## linkToCode Utility

`linkToCode` (from `ConnectorUtils.ts`) scans the graph for code nodes (files,
functions, classes, methods, interfaces, variables) whose names appear in a block of
text and creates edges back to them.

```ts
import { linkToCode } from './ConnectorUtils.js';

const searchText = [item.title, item.body ?? ''].join(' ');
edgesAdded += linkToCode(store, searchText, nodeId, 'applies_to');
```

Pass `{ checkPaths: true }` as the fourth argument to also match file paths found in
the text, not just symbol names. Names shorter than three characters are skipped to
avoid false positives.

## SyncManager Registration

Once your connector class exists, register it with `SyncManager`:

```ts
import { SyncManager } from './SyncManager.js';
import { PagerDutyConnector } from './PagerDutyConnector.js';

const syncManager = new SyncManager(store, graphDir);
syncManager.registerConnector(new PagerDutyConnector(), {
  apiKeyEnv: 'PAGERDUTY_API_KEY',
  baseUrlEnv: 'PAGERDUTY_BASE_URL',
});

// Sync a single connector
await syncManager.sync('pagerduty');

// Or sync every registered connector
await syncManager.syncAll();
```

`SyncManager` persists a `sync-metadata.json` file that records the last sync
timestamp and result for each connector.

## Testing

Use the injected `HttpClient` to return canned responses without network access:

```ts
function mockHttpClient(pages: unknown[]): HttpClient {
  let callIndex = 0;
  return async () => ({
    ok: true,
    status: 200,
    json: async () => pages[callIndex++],
  });
}

it('ingests incidents into the graph', async () => {
  const store = createEmptyGraphStore();
  const client = mockHttpClient([
    { incidents: [{ id: 'INC-1', title: 'CPU spike' }], more: false },
  ]);
  const connector = new PagerDutyConnector(client);

  process.env.PAGERDUTY_API_KEY = 'test-key';
  process.env.PAGERDUTY_BASE_URL = 'https://api.example.com';

  const result = await connector.ingest(store, {});
  expect(result.nodesAdded).toBe(1);
  expect(result.errors).toHaveLength(0);
});
```

Keep fixture data small -- one or two entities per page is enough to verify
pagination, node creation, and edge linking.

## Example: Minimal PagerDuty Connector

```ts
import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode } from './ConnectorUtils.js';

interface Incident {
  id: string;
  title: string;
  description?: string;
  status: string;
}
interface PDResponse {
  incidents: Incident[];
  more: boolean;
}

export class PagerDutyConnector implements GraphConnector {
  readonly name = 'pagerduty';
  readonly source = 'pagerduty';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, opts) => fetch(url, opts));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const apiKey = process.env[config.apiKeyEnv ?? 'PAGERDUTY_API_KEY'];
    const baseUrl = process.env[config.baseUrlEnv ?? 'PAGERDUTY_BASE_URL'];
    if (!apiKey || !baseUrl) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: ['Missing API key or base URL'],
        durationMs: Date.now() - start,
      };
    }

    let nodesAdded = 0,
      edgesAdded = 0,
      offset = 0;
    const headers = { Authorization: `Token token=${apiKey}` };
    let more = true;

    while (more) {
      const res = await this.httpClient(`${baseUrl}/incidents?offset=${offset}&limit=25`, {
        headers,
      });
      if (!res.ok) break;
      const data = (await res.json()) as PDResponse;
      for (const inc of data.incidents) {
        const nodeId = `incident:pagerduty:${inc.id}`;
        store.addNode({
          id: nodeId,
          type: 'issue',
          name: inc.title,
          metadata: { status: inc.status },
        });
        nodesAdded++;
        edgesAdded += linkToCode(
          store,
          [inc.title, inc.description ?? ''].join(' '),
          nodeId,
          'applies_to'
        );
      }
      more = data.more;
      offset += 25;
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }
}
```
