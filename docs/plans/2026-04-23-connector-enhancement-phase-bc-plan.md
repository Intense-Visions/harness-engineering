# Plan: Connector Enhancement Phase B + C

**Date:** 2026-04-23 | **Spec:** docs/changes/connector-enhancement/proposal.md | **Tasks:** 10 | **Time:** ~40 min

## Goal

Enhance Jira, Confluence, and Slack connectors with richer business knowledge extraction (comments, hierarchy, threads, reactions), wire all three through `condenseContent()`, complete the KnowledgeLinker pipeline (clustering, staged output, multi-source dedup), and integrate it as a post-sync pass in SyncManager.

## Observable Truths

### Jira (SC 5-8)

- OT-1: Issue nodes include comment text (chronological, author-prefixed) in content
- OT-2: `metadata.acceptanceCriteria: string[]` parsed from description
- OT-3: `metadata.customFields: Record<string, string>` from non-null custom fields
- OT-4: Assembled content runs through `condenseContent()` (default 4000)
- OT-5: Condensed nodes carry `metadata.condensed` and `metadata.originalLength`

### Confluence (SC 9-12)

- OT-6: Child pages have `contains` edges from parent document nodes
- OT-7: `metadata.labels: string[]` from page labels
- OT-8: Full body runs through `condenseContent()` (default 8000)
- OT-9: `metadata.parentPageId` set when ancestors exist

### Slack (SC 13-15)

- OT-10: Thread replies concatenated into conversation node content
- OT-11: `metadata.reactions: Record<string, number>` from message reactions
- OT-12: `metadata.threadReplyCount` stores reply count

### KnowledgeLinker (SC 16-23)

- OT-13: 3+ extractions from same source create `business_concept` cluster node
- OT-14: Medium-confidence (0.5-0.8) written to `.harness/knowledge/staged/` JSONL
- OT-15: Duplicate facts merged with `metadata.sources[]` containing all source IDs

### SyncManager (SC 16-17)

- OT-16: `syncAll()` invokes `KnowledgeLinker.link()` after connectors complete
- OT-17: Combined result includes KnowledgeLinker node counts

### Regression (SC 24-26)

- OT-18: All existing connector tests pass unchanged
- OT-19: `harness validate` passes

## Uncertainties

- [ASSUMPTION] Jira comments API shape: `{ comments: [{ author: { displayName }, body, created }] }`. Tests use mocks.
- [ASSUMPTION] Confluence V2 supports `ancestors` and `metadata.labels` in response. Tests use mocks.
- [ASSUMPTION] Slack `conversations.replies` returns `{ ok, messages: [{ text, user, ts }] }`. Tests use mocks.
- [DEFERRABLE] KnowledgeLinker clustering uses source-node grouping (simplest correct approach per spec).

## File Map

```
MODIFY packages/graph/src/ingest/connectors/JiraConnector.ts
MODIFY packages/graph/src/ingest/connectors/ConfluenceConnector.ts
MODIFY packages/graph/src/ingest/connectors/SlackConnector.ts
MODIFY packages/graph/src/ingest/KnowledgeLinker.ts
MODIFY packages/graph/src/ingest/connectors/SyncManager.ts
MODIFY packages/graph/tests/ingest/connectors/JiraConnector.test.ts
MODIFY packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts
MODIFY packages/graph/tests/ingest/connectors/SlackConnector.test.ts
MODIFY packages/graph/tests/ingest/KnowledgeLinker.test.ts
MODIFY packages/graph/tests/ingest/connectors/SyncManager.test.ts
```

## Tasks

### Task 1: Jira — Add comments fetch and content assembly (TDD)

**Depends on:** none | **Truths:** OT-1, OT-4, OT-5

**Test first** — add to `JiraConnector.test.ts`:

```typescript
it('includes comment text in issue node content', async () => {
  process.env['JIRA_API_KEY'] = 'test-key';
  process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

  const searchResponse = {
    issues: [
      {
        key: 'ENG-100',
        fields: {
          summary: 'Auth bug',
          description: 'Login fails on timeout',
          status: { name: 'Open' },
          priority: { name: 'High' },
          assignee: { displayName: 'Alice' },
          labels: [],
        },
      },
    ],
    total: 1,
  };

  const commentsResponse = {
    comments: [
      {
        author: { displayName: 'Bob' },
        body: 'Reproduced on staging',
        created: '2026-01-01T00:00:00Z',
      },
      {
        author: { displayName: 'Alice' },
        body: 'Fixed in PR #42',
        created: '2026-01-02T00:00:00Z',
      },
    ],
  };

  let callCount = 0;
  const httpClient = async (url: string) => {
    callCount++;
    return {
      ok: true as const,
      json: async () => (url.includes('/comment') ? commentsResponse : searchResponse),
    };
  };

  const connector = new JiraConnector(httpClient);
  const result = await connector.ingest(store, { maxContentLength: 4000 });

  expect(result.nodesAdded).toBe(1);
  const node = store.getNode('issue:jira:ENG-100');
  expect(node!.content).toContain('Bob');
  expect(node!.content).toContain('Reproduced on staging');
  expect(node!.content).toContain('Alice');
  expect(node!.content).toContain('Fixed in PR #42');
});

it('applies condenseContent with maxContentLength config', async () => {
  process.env['JIRA_API_KEY'] = 'test-key';
  process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

  const longDescription = 'a'.repeat(5000);
  const searchResponse = {
    issues: [
      {
        key: 'ENG-200',
        fields: {
          summary: 'Long issue',
          description: longDescription,
          status: { name: 'Open' },
          priority: null,
          assignee: null,
          labels: [],
        },
      },
    ],
    total: 1,
  };

  const httpClient = async (url: string) => ({
    ok: true as const,
    json: async () => (url.includes('/comment') ? { comments: [] } : searchResponse),
  });

  const connector = new JiraConnector(httpClient);
  await connector.ingest(store, { maxContentLength: 500 });

  const node = store.getNode('issue:jira:ENG-200');
  expect(node!.content!.length).toBeLessThanOrEqual(501);
  expect(node!.metadata.condensed).toBeDefined();
  expect(node!.metadata.originalLength).toBe(longDescription.length + 'Long issue\n'.length);
});
```

**Implement** in `JiraConnector.ts`:

- Add `JiraComment` interface: `{ author: { displayName: string }, body: string, created: string }`
- Add `JiraCommentsResponse` interface: `{ comments: JiraComment[] }`
- Add `fetchComments(baseUrl, issueKey, headers)` private method
- Update `processIssue()` to accept `baseUrl`, `headers`, `config` params
- Assemble content: `[summary]\n[description]\n[comments: "Author (date): body"]`
- Import and call `condenseContent()` on assembled text
- Set `metadata.condensed` and `metadata.originalLength` from result
- Store condensed content as `node.content`
- Default `maxContentLength` to 4000

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/JiraConnector.test.ts`

---

### Task 2: Jira — Add acceptance criteria and custom fields extraction (TDD)

**Depends on:** Task 1 | **Truths:** OT-2, OT-3

**Test first** — add to `JiraConnector.test.ts`:

```typescript
it('extracts acceptance criteria from description', async () => {
  process.env['JIRA_API_KEY'] = 'test-key';
  process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

  const searchResponse = {
    issues: [
      {
        key: 'ENG-300',
        fields: {
          summary: 'Feature X',
          description:
            'Overview\n\nAcceptance Criteria:\n- [x] User can log in\n- [ ] Error shown on failure\n\nGiven a user When they submit Then form validates',
          status: { name: 'Open' },
          priority: null,
          assignee: null,
          labels: [],
        },
      },
    ],
    total: 1,
  };

  const httpClient = async (url: string) => ({
    ok: true as const,
    json: async () => (url.includes('/comment') ? { comments: [] } : searchResponse),
  });

  const connector = new JiraConnector(httpClient);
  await connector.ingest(store, {});

  const node = store.getNode('issue:jira:ENG-300');
  expect(node!.metadata.acceptanceCriteria).toEqual(
    expect.arrayContaining([
      expect.stringContaining('User can log in'),
      expect.stringContaining('Error shown on failure'),
      expect.stringContaining('Given a user When they submit Then form validates'),
    ])
  );
});

it('extracts non-null custom fields', async () => {
  process.env['JIRA_API_KEY'] = 'test-key';
  process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

  const searchResponse = {
    issues: [
      {
        key: 'ENG-400',
        fields: {
          summary: 'Custom fields test',
          description: null,
          status: { name: 'Open' },
          priority: null,
          assignee: null,
          labels: [],
          customfield_10001: 'Sprint 5',
          customfield_10002: null,
          customfield_10003: 'Team Alpha',
        },
      },
    ],
    total: 1,
  };

  const httpClient = async (url: string) => ({
    ok: true as const,
    json: async () => (url.includes('/comment') ? { comments: [] } : searchResponse),
  });

  const connector = new JiraConnector(httpClient);
  await connector.ingest(store, {});

  const node = store.getNode('issue:jira:ENG-400');
  expect(node!.metadata.customFields).toEqual({
    customfield_10001: 'Sprint 5',
    customfield_10003: 'Team Alpha',
  });
});
```

**Implement** in `JiraConnector.ts`:

- Add `parseAcceptanceCriteria(description: string): string[]` — match Given/When/Then lines and `[x]`/`[ ]` checkbox lines
- Add `extractCustomFields(fields: Record<string, unknown>): Record<string, string>` — filter `customfield_*` keys with non-null string values
- Update `JiraIssue` interface to allow `[key: string]: unknown` for custom fields
- Wire both into `processIssue()` metadata

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/JiraConnector.test.ts`

---

### Task 3: Confluence — Add ancestors, labels, hierarchy edges, and condense (TDD)

**Depends on:** none | **Truths:** OT-6, OT-7, OT-8, OT-9

**Test first** — add to `ConfluenceConnector.test.ts`:

```typescript
it('creates contains edge from parent to child page', async () => {
  process.env['CONFLUENCE_API_KEY'] = 'test-key';
  process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

  const fixture = {
    results: [
      {
        id: '456',
        title: 'Child Page',
        status: 'current',
        body: { storage: { value: 'child content' } },
        ancestors: [{ id: '100' }, { id: '200' }],
        _links: { webui: '/wiki/pages/456' },
      },
    ],
    _links: { next: null },
  };

  const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
  const result = await connector.ingest(store, { spaceKey: 'DEV' });

  expect(result.nodesAdded).toBe(1);
  const edges = store.getEdges({ from: 'confluence:200', to: 'confluence:456', type: 'contains' });
  expect(edges).toHaveLength(1);

  const node = store.getNode('confluence:456');
  expect(node!.metadata.parentPageId).toBe('200');
});

it('stores page labels in metadata', async () => {
  process.env['CONFLUENCE_API_KEY'] = 'test-key';
  process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

  const fixture = {
    results: [
      {
        id: '789',
        title: 'Labeled Page',
        status: 'current',
        body: { storage: { value: 'labeled content' } },
        metadata: { labels: { results: [{ name: 'architecture' }, { name: 'backend' }] } },
        _links: { webui: '/wiki/pages/789' },
      },
    ],
    _links: { next: null },
  };

  const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
  await connector.ingest(store, { spaceKey: 'DEV' });

  const node = store.getNode('confluence:789');
  expect(node!.metadata.labels).toEqual(['architecture', 'backend']);
});

it('runs body through condenseContent at default 8000 limit', async () => {
  process.env['CONFLUENCE_API_KEY'] = 'test-key';
  process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

  const longBody = 'a'.repeat(10000);
  const fixture = {
    results: [
      {
        id: '999',
        title: 'Long Page',
        status: 'current',
        body: { storage: { value: longBody } },
        _links: { webui: '/wiki/pages/999' },
      },
    ],
    _links: { next: null },
  };

  const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
  await connector.ingest(store, { spaceKey: 'DEV' });

  const node = store.getNode('confluence:999');
  expect(node!.content!.length).toBeLessThanOrEqual(8001);
  expect(node!.metadata.condensed).toBeDefined();
  expect(node!.metadata.originalLength).toBeGreaterThan(8000);
});
```

**Implement** in `ConfluenceConnector.ts`:

- Update `ConfluencePage` interface: add `ancestors?: { id: string }[]` and `metadata?: { labels?: { results?: { name: string }[] } }`
- Import `condenseContent` from `ContentCondenser.js`
- Update `processPage()` to be async, accept `config`
- Extract labels: `page.metadata?.labels?.results?.map(l => l.name) ?? []`
- Extract parent: last ancestor `page.ancestors?.[page.ancestors.length - 1]?.id`
- Create `contains` edge from parent node to current node
- Run `title + body` through `condenseContent()` with `config.maxContentLength ?? 8000`
- Set `metadata.labels`, `metadata.parentPageId`, `metadata.condensed`, `metadata.originalLength`
- Store condensed content as `node.content`

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts`

---

### Task 4: Confluence — Ensure existing tests pass with async processPage

**Depends on:** Task 3 | **Truths:** OT-18

Since `processPage` becomes async, existing test patterns may need minor adjustments. Verify all existing Confluence tests still pass. The `fetchAllPages` loop already awaits, so the async change should propagate naturally. Run full test suite.

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/ConfluenceConnector.test.ts`

---

### Task 5: Slack — Add thread replies fetch (TDD)

**Depends on:** none | **Truths:** OT-10, OT-12

**Test first** — add to `SlackConnector.test.ts`:

```typescript
it('fetches thread replies and concatenates into node content', async () => {
  process.env['SLACK_API_KEY'] = 'xoxb-test';

  const historyResponse = {
    ok: true,
    messages: [
      {
        text: 'Should we use Redis or Memcached?',
        user: 'U100',
        ts: '1000.000',
        reply_count: 2,
        thread_ts: '1000.000',
      },
    ],
  };

  const repliesResponse = {
    ok: true,
    messages: [
      { text: 'Should we use Redis or Memcached?', user: 'U100', ts: '1000.000' },
      { text: 'Redis - it supports pub/sub', user: 'U200', ts: '1000.001' },
      { text: 'Agreed, going with Redis', user: 'U100', ts: '1000.002' },
    ],
  };

  const httpClient = async (url: string) => ({
    ok: true as const,
    json: async () => (url.includes('conversations.replies') ? repliesResponse : historyResponse),
  });

  const connector = new SlackConnector(httpClient);
  const result = await connector.ingest(store, { channels: ['C100'] });

  expect(result.nodesAdded).toBe(1);
  const node = store.getNode('conversation:slack:C100:1000.000');
  expect(node!.content).toContain('Redis - it supports pub/sub');
  expect(node!.content).toContain('Agreed, going with Redis');
  expect(node!.metadata.threadReplyCount).toBe(2);
});
```

**Implement** in `SlackConnector.ts`:

- Update `SlackMessage` interface: add optional `reply_count?: number`, `thread_ts?: string`, `reactions?: { name: string; count: number }[]`
- Add `SlackRepliesResponse` interface
- Add `fetchThreadReplies(channel, threadTs, apiKey)` private method
- In `processChannel()`, after getting history messages, check each message for `reply_count > 0`
- If replies exist, fetch them, skip the first (it's the parent), concatenate as `[User (ts): text]`
- Assemble: `[original text]\n[replies]`
- Set `metadata.threadReplyCount`

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/SlackConnector.test.ts`

---

### Task 6: Slack — Add reactions and condenseContent wiring (TDD)

**Depends on:** Task 5 | **Truths:** OT-11, OT-4 (Slack variant)

**Test first** — add to `SlackConnector.test.ts`:

```typescript
it('stores reaction counts in metadata', async () => {
  process.env['SLACK_API_KEY'] = 'xoxb-test';

  const fixture = {
    ok: true,
    messages: [
      {
        text: 'Deploy approved',
        user: 'U100',
        ts: '2000.000',
        reactions: [
          { name: '+1', count: 5 },
          { name: 'white_check_mark', count: 3 },
        ],
      },
    ],
  };

  const connector = new SlackConnector(makeMockHttpClient(fixture));
  await connector.ingest(store, { channels: ['C200'] });

  const node = store.getNode('conversation:slack:C200:2000.000');
  expect(node!.metadata.reactions).toEqual({ '+1': 5, white_check_mark: 3 });
});

it('applies condenseContent with maxContentLength', async () => {
  process.env['SLACK_API_KEY'] = 'xoxb-test';

  const longText = 'decision: '.repeat(500);
  const fixture = {
    ok: true,
    messages: [
      {
        text: longText,
        user: 'U100',
        ts: '3000.000',
      },
    ],
  };

  const connector = new SlackConnector(makeMockHttpClient(fixture));
  await connector.ingest(store, { channels: ['C300'], maxContentLength: 100 });

  const node = store.getNode('conversation:slack:C300:3000.000');
  expect(node!.content!.length).toBeLessThanOrEqual(101);
  expect(node!.metadata.condensed).toBeDefined();
});
```

**Implement** in `SlackConnector.ts`:

- Import `condenseContent` from `ContentCondenser.js`
- Extract reactions: `message.reactions?.reduce((acc, r) => ({ ...acc, [r.name]: r.count }), {})`
- Set `metadata.reactions`
- Run assembled content through `condenseContent()` with `config.maxContentLength ?? 2000`
- Set `metadata.condensed`, `metadata.originalLength`
- Store as `node.content`
- Pass `config` through to `processChannel()`

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/SlackConnector.test.ts`

---

### Task 7: KnowledgeLinker — Add clustering (Stage 2) (TDD)

**Depends on:** none | **Truths:** OT-13

**Test first** — add to `KnowledgeLinker.test.ts`:

```typescript
describe('clustering (Stage 2)', () => {
  it('creates business_concept node when 3+ extractions share a source', async () => {
    // Content that triggers 3+ heuristic patterns from same node
    const richContent =
      'The system must validate all user inputs. ' +
      'SLA requires 99.9% availability under 200ms. ' +
      'All handling must comply with GDPR and SOC2 requirements. ' +
      'Given a logged-in user When they submit Then data is saved.';

    addDocumentNode(store, 'doc:rich', richContent);
    const linker = new KnowledgeLinker(store);
    const result = await linker.link();

    expect(result.conceptsClustered).toBeGreaterThan(0);
    const concepts = store.findNodes({ type: 'business_concept' });
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts[0]!.metadata.sources).toContain('doc:rich');
  });

  it('does not cluster when fewer than 3 extractions from a source', async () => {
    addDocumentNode(store, 'doc:sparse', 'Must comply with GDPR requirements');
    const linker = new KnowledgeLinker(store);
    const result = await linker.link();
    expect(result.conceptsClustered).toBe(0);
  });
});
```

**Implement** in `KnowledgeLinker.ts`:

- After Stage 1 (scan), group candidates by `sourceNodeId`
- For groups with 3+ candidates, create a `business_concept` node:
  - `id: concept:linker:<hash of sourceNodeId>`
  - `name: Business concept cluster from <sourceNodeId>`
  - `metadata: { source: 'knowledge-linker', sources: [sourceNodeId], factCount: N }`
- Create `contains` edges from concept to each promoted fact in the group
- Increment `conceptsClustered`

**Verify:** `npx vitest run packages/graph/tests/ingest/KnowledgeLinker.test.ts`

---

### Task 8: KnowledgeLinker — Add staged output and multi-source dedup (TDD)

**Depends on:** Task 7 | **Truths:** OT-14, OT-15

**Test first** — add to `KnowledgeLinker.test.ts`:

```typescript
describe('staged output', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linker-staged-'));
  });

  it('writes medium-confidence extractions to staged JSONL', async () => {
    // Monetary pattern has confidence 0.6
    addIssueNode(store, 'issue:staged', 'Budget is $25,000 for Q1');
    const linker = new KnowledgeLinker(store, tmpDir);
    await linker.link();

    const stagedPath = path.join(tmpDir, 'staged', 'linker-staged.jsonl');
    const content = await fs.readFile(stagedPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const record = JSON.parse(lines[0]);
    expect(record.confidence).toBeGreaterThanOrEqual(0.5);
    expect(record.confidence).toBeLessThan(0.8);
  });
});

describe('deduplication', () => {
  it('merges duplicate facts from different sources', async () => {
    // Same regulatory pattern from two different nodes
    addDocumentNode(store, 'doc:dup1', 'All systems must comply with GDPR');
    addIssueNode(store, 'issue:dup2', 'All systems must comply with GDPR');

    const linker = new KnowledgeLinker(store);
    const result = await linker.link();

    expect(result.duplicatesMerged).toBeGreaterThan(0);
    const facts = store.findNodes({ type: 'business_fact' });
    // Should have facts but some merged
    for (const fact of facts) {
      if (fact.metadata.sources && (fact.metadata.sources as string[]).length > 1) {
        expect((fact.metadata.sources as string[]).length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
```

**Implement** in `KnowledgeLinker.ts`:

- Add `writeStagedJsonl(candidates)` method — writes medium-confidence (0.5-0.8) to `<outputDir>/staged/linker-staged.jsonl`
- In Stage 3 (promote), before creating a fact node:
  - Check existing `business_fact` nodes for matching content (same `content` text)
  - If found, update the existing node's `metadata.sources[]` to include new source, increment `duplicatesMerged`
  - If not found, create new node as before
- Call `writeStagedJsonl()` after promotion

**Verify:** `npx vitest run packages/graph/tests/ingest/KnowledgeLinker.test.ts`

---

### Task 9: SyncManager — Add KnowledgeLinker post-sync invocation (TDD)

**Depends on:** Task 7 | **Truths:** OT-16, OT-17

**Test first** — add to `SyncManager.test.ts`:

```typescript
it('invokes KnowledgeLinker after syncAll completes', async () => {
  const result: IngestResult = {
    nodesAdded: 1,
    nodesUpdated: 0,
    edgesAdded: 0,
    edgesUpdated: 0,
    errors: [],
    durationMs: 1,
  };

  // Create a connector that adds a document node with business content
  const connector: GraphConnector = {
    name: 'test-linker',
    source: 'test',
    ingest: async (s: GraphStore) => {
      s.addNode({
        id: 'doc:sync-test',
        type: 'document',
        name: 'Sync Test Doc',
        content: 'All systems must comply with SOC2 and GDPR requirements',
        metadata: { source: 'test' },
      });
      return result;
    },
  };

  manager.registerConnector(connector, {});
  const combined = await manager.syncAll();

  // KnowledgeLinker should have run and created business_fact nodes
  const facts = store.findNodes({ type: 'business_fact' });
  expect(facts.length).toBeGreaterThan(0);
  expect(combined.nodesAdded).toBeGreaterThan(1); // connector node + linker facts
});
```

**Implement** in `SyncManager.ts`:

- Import `KnowledgeLinker` from `../KnowledgeLinker.js`
- After the connector sync loop in `syncAll()`, create `new KnowledgeLinker(this.store)` and call `await linker.link()`
- Add linker's `factsCreated` to `combined.nodesAdded` and any errors to `combined.errors`

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/SyncManager.test.ts`

---

### Task 10: Full validation and regression check

**Depends on:** Tasks 1-9 | **Truths:** OT-18, OT-19

- Run full graph package test suite: `npx vitest run packages/graph/tests/`
- Run `harness validate`
- Verify no type errors: `npx tsc --noEmit -p packages/graph/tsconfig.json`
- Fix any regressions found

## Dependency Graph

```
Task 1 (Jira comments) ──→ Task 2 (Jira AC/custom)
Task 3 (Confluence)     ──→ Task 4 (Confluence regression)
Task 5 (Slack threads)  ──→ Task 6 (Slack reactions/condense)
Task 7 (KL clustering)  ──→ Task 8 (KL staged/dedup)
Task 7 (KL clustering)  ──→ Task 9 (SyncManager)
Tasks 1-9               ──→ Task 10 (Validation)
```

**Parallel opportunities:** Tasks 1-2, 3-4, 5-6, and 7-8 are independent tracks. Tasks 1, 3, 5, 7 can all start in parallel.

## Traceability

| Observable Truth           | Task(s)    |
| -------------------------- | ---------- |
| OT-1 (Jira comments)       | Task 1     |
| OT-2 (AC parsing)          | Task 2     |
| OT-3 (Custom fields)       | Task 2     |
| OT-4 (Jira condense)       | Task 1     |
| OT-5 (Condense metadata)   | Task 1     |
| OT-6 (Contains edges)      | Task 3     |
| OT-7 (Labels)              | Task 3     |
| OT-8 (Confluence condense) | Task 3     |
| OT-9 (parentPageId)        | Task 3     |
| OT-10 (Thread replies)     | Task 5     |
| OT-11 (Reactions)          | Task 6     |
| OT-12 (threadReplyCount)   | Task 5     |
| OT-13 (Clustering)         | Task 7     |
| OT-14 (Staged output)      | Task 8     |
| OT-15 (Dedup merge)        | Task 8     |
| OT-16 (Post-sync linker)   | Task 9     |
| OT-17 (Combined counts)    | Task 9     |
| OT-18 (Regression)         | Task 4, 10 |
| OT-19 (harness validate)   | Task 10    |
