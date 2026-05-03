# Plan: Graph Connectors & CLI Commands (Phase 3 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 14
**Estimated time:** 60-80 minutes

## Goal

Build the connector architecture in `packages/graph` (interface, SyncManager, JiraConnector, SlackConnector) and add 6 new CLI commands in `packages/cli` (`scan`, `watch`, `ingest`, `query`, `graph status`, `graph export`) — making the knowledge graph usable from the command line and extensible with external data sources.

## Observable Truths (Acceptance Criteria)

1. When `GraphConnector` interface is implemented, the system shall enforce `name`, `source`, `ingest()`, and optional `schedule` fields.
2. When `SyncManager.sync(connectorName)` is called, the system shall run the connector's `ingest()`, update `lastSyncTimestamp` in sync-metadata.json, and return IngestResult.
3. When `SyncManager.syncAll()` is called, the system shall run all configured connectors in sequence.
4. When `JiraConnector.ingest()` is called with config containing `apiKeyEnv` and `project`, the system shall create `issue` nodes linked to code via FusionLayer. If the API key env var is missing, it shall return an error in IngestResult without throwing.
5. When `SlackConnector.ingest()` is called with config containing `apiKeyEnv` and `channels`, the system shall create `conversation` nodes linked to code via keyword matching. If the API key env var is missing, it shall return an error without throwing.
6. When `harness scan [path]` CLI command is run, the system shall ingest code + knowledge + git into the graph and save to `.harness/graph/`.
7. When `harness ingest --source <name>` CLI command is run, the system shall run the specified connector.
8. When `harness query <dsl>` CLI command is run, the system shall execute a ContextQL query and print results.
9. When `harness graph status` CLI command is run, the system shall show graph statistics (node/edge counts, staleness).
10. When `harness graph export --format json` CLI command is run, the system shall export the graph as JSON to stdout.
11. `pnpm build` succeeds for both graph and cli packages.
12. All new tests pass.

## File Map

```
CREATE packages/graph/src/ingest/connectors/ConnectorInterface.ts
CREATE packages/graph/src/ingest/connectors/SyncManager.ts
CREATE packages/graph/src/ingest/connectors/JiraConnector.ts
CREATE packages/graph/src/ingest/connectors/SlackConnector.ts
CREATE packages/graph/tests/ingest/connectors/SyncManager.test.ts
CREATE packages/graph/tests/ingest/connectors/JiraConnector.test.ts
CREATE packages/graph/tests/ingest/connectors/SlackConnector.test.ts
CREATE packages/cli/src/commands/graph/index.ts
CREATE packages/cli/src/commands/graph/scan.ts
CREATE packages/cli/src/commands/graph/ingest.ts
CREATE packages/cli/src/commands/graph/query.ts
CREATE packages/cli/src/commands/graph/status.ts
CREATE packages/cli/src/commands/graph/export.ts
CREATE packages/cli/tests/commands/graph.test.ts
MODIFY packages/graph/src/index.ts (add connector exports)
MODIFY packages/cli/src/index.ts (register graph commands)
MODIFY packages/cli/package.json (add @harness-engineering/graph dependency)
```

## Tasks

### Task 1: Implement ConnectorInterface and SyncManager (TDD)

**Depends on:** none
**Files:** packages/graph/src/ingest/connectors/ConnectorInterface.ts, SyncManager.ts, tests

1. Create ConnectorInterface:

   ```typescript
   export interface ConnectorConfig {
     apiKeyEnv?: string;
     schedule?: string;
     [key: string]: unknown;
   }
   export interface GraphConnector {
     readonly name: string;
     readonly source: string;
     ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult>;
   }
   export interface SyncMetadata {
     connectors: Record<string, { lastSyncTimestamp: string; lastResult: IngestResult }>;
   }
   ```

2. Create SyncManager that:
   - Constructor takes GraphStore + sync metadata directory path
   - `registerConnector(connector, config)` — stores connector + config
   - `sync(connectorName)` — runs connector.ingest(), updates metadata, saves
   - `syncAll()` — runs all registered connectors in sequence
   - `getMetadata()` — returns sync state
   - Loads/saves `sync-metadata.json` from the graph directory

3. Write tests with mock connectors.
4. Commit: `feat(graph): add connector interface and SyncManager`

---

### Task 2: Implement JiraConnector (TDD)

**Depends on:** Task 1
**Files:** packages/graph/src/ingest/connectors/JiraConnector.ts, tests

1. JiraConnector implements GraphConnector with:
   - `name: 'jira'`, `source: 'jira'`
   - `ingest(store, config)` — reads `config.apiKeyEnv` from env, makes HTTP requests to Jira REST API, creates `issue` nodes, links to code via FusionLayer
   - If API key env var is not set, returns error in IngestResult
   - Accepts `httpClient` in constructor for testability (dependency injection)
   - Config: `{ apiKeyEnv, baseUrlEnv, project, filters?: { status?, labels? } }`

2. Tests mock the HTTP client with fixture Jira API responses.
3. Commit: `feat(graph): add JiraConnector for issue ingestion`

---

### Task 3: Implement SlackConnector (TDD)

**Depends on:** Task 1
**Files:** packages/graph/src/ingest/connectors/SlackConnector.ts, tests

1. SlackConnector implements GraphConnector with:
   - `name: 'slack'`, `source: 'slack'`
   - `ingest(store, config)` — reads `config.apiKeyEnv` from env, makes HTTP requests to Slack API, creates `conversation` nodes, links to code via keyword matching
   - If API key env var is not set, returns error
   - Accepts `httpClient` for testability
   - Config: `{ apiKeyEnv, channels, lookbackDays? }`

2. Tests mock the HTTP client.
3. Commit: `feat(graph): add SlackConnector for conversation ingestion`

---

### Task 4: Update graph package exports

**Depends on:** Tasks 1, 2, 3
**Files:** packages/graph/src/index.ts

1. Add exports for ConnectorInterface, SyncManager, JiraConnector, SlackConnector.
2. Verify build: `pnpm build --filter @harness-engineering/graph`
3. Commit: `feat(graph): export connector architecture`

---

### Task 5: Add graph dependency to CLI

**Depends on:** none
**Files:** packages/cli/package.json

1. Add `"@harness-engineering/graph": "workspace:*"` to dependencies.
2. Run `pnpm install`.
3. Commit: `chore(cli): add @harness-engineering/graph dependency`

---

### Task 6: Implement `harness scan` command

**Depends on:** Task 5
**Files:** packages/cli/src/commands/graph/scan.ts

1. Create scan command following CLI pattern:
   - `harness scan [path]` — defaults to cwd
   - Runs CodeIngestor + TopologicalLinker + KnowledgeIngestor + GitIngestor
   - Saves graph to `.harness/graph/`
   - Shows progress: "Scanning... N files found... N nodes, N edges... Done in Xs"
   - Returns exit code 0 on success

2. Commit: `feat(cli): add harness scan command for graph ingestion`

---

### Task 7: Implement `harness ingest` command

**Depends on:** Task 5
**Files:** packages/cli/src/commands/graph/ingest.ts

1. Create ingest command:
   - `harness ingest --source <name>` — run specific connector
   - `harness ingest --all` — run all configured connectors
   - `harness ingest --source <name> --full` — force complete re-pull
   - Reads connector config from harness.config.json `graph.connectors` section
   - Uses SyncManager for incremental sync
   - Shows connector name, items synced, timing

2. Commit: `feat(cli): add harness ingest command for connector sync`

---

### Task 8: Implement `harness query` command

**Depends on:** Task 5
**Files:** packages/cli/src/commands/graph/query.ts

1. Create query command:
   - `harness query <rootNodeId> [--depth N] [--types type1,type2] [--edges edge1,edge2] [--bidirectional]`
   - Loads graph from `.harness/graph/`
   - Executes ContextQL query
   - Prints results as formatted table or JSON (with `--json` flag)
   - Shows node count, edge count, pruned count

2. Commit: `feat(cli): add harness query command for graph traversal`

---

### Task 9: Implement `harness graph status` and `harness graph export` commands

**Depends on:** Task 5
**Files:** packages/cli/src/commands/graph/status.ts, export.ts, index.ts

1. Create `graph` compound command with subcommands:

   **status**: Shows graph statistics:
   - Total nodes/edges
   - Counts by node type
   - Counts by edge type
   - Last scan timestamp + staleness
   - Connector sync status (if any)

   **export**: Exports graph:
   - `harness graph export --format json` — full graph as JSON
   - `harness graph export --format mermaid` — dependency diagram as Mermaid
   - Outputs to stdout (pipe-friendly)

2. Create `index.ts` that registers both subcommands under `graph`.
3. Commit: `feat(cli): add harness graph status and export commands`

---

### Task 10: Register graph commands in CLI

**Depends on:** Tasks 6, 7, 8, 9
**Files:** packages/cli/src/index.ts

1. Import and register all graph commands:

   ```typescript
   import { createGraphCommand } from './commands/graph/index.js';
   import { createScanCommand } from './commands/graph/scan.js';
   import { createIngestCommand } from './commands/graph/ingest.js';
   import { createQueryCommand } from './commands/graph/query.js';

   program.addCommand(createScanCommand());
   program.addCommand(createIngestCommand());
   program.addCommand(createQueryCommand());
   program.addCommand(createGraphCommand()); // compound: status + export
   ```

2. Verify: `pnpm build --filter @harness-engineering/cli`
3. Commit: `feat(cli): register graph commands in harness CLI`

---

### Task 11: Write CLI command tests

**Depends on:** Task 10
**Files:** packages/cli/tests/commands/graph.test.ts

1. Test each command's `run*()` function (business logic, not Commander binding):
   - `runScan` creates graph from a fixture directory
   - `runQuery` returns results for known graph
   - `runGraphStatus` returns statistics
   - `runGraphExport` returns JSON or Mermaid string
   - Error cases: missing graph, invalid query

2. Commit: `test(cli): add tests for graph commands`

---

### Task 12: Build and test verification

**Depends on:** Task 11
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/graph && npx vitest run` — all pass
2. Run: `cd packages/mcp-server && npx vitest run` — all pass
3. Run: `cd packages/cli && npx vitest run` — all pass (or check for pre-existing failures)
4. Run: `pnpm build` — verify graph + cli build
5. Commit: `chore: verify Phase 3 build and tests`

---

## Dependency Graph

```
Task 1 (ConnectorInterface + SyncManager) ──→ Task 2 (JiraConnector) ──→ Task 4 (exports)
                                          ──→ Task 3 (SlackConnector) ──┘
                                                                         │
Task 5 (CLI dep) ──→ Task 6 (scan) ──────────────────────────────────────→ Task 10 (register) ──→ Task 11 (tests) ──→ Task 12 (verify)
              ──→ Task 7 (ingest) ──────────────────────────────────────→│
              ──→ Task 8 (query) ───────────────────────────────────────→│
              ──→ Task 9 (status + export) ─────────────────────────────→│
```

**Parallelizable:**

- Tasks 2 + 3 (JiraConnector + SlackConnector)
- Tasks 6, 7, 8, 9 (all CLI commands — independent of each other)
- Tasks 1-4 (graph) and Tasks 5-9 (CLI) are fully independent workstreams

## Traceability Matrix

| Observable Truth            | Delivered By |
| --------------------------- | ------------ |
| 1. GraphConnector interface | Task 1       |
| 2. SyncManager.sync         | Task 1       |
| 3. SyncManager.syncAll      | Task 1       |
| 4. JiraConnector            | Task 2       |
| 5. SlackConnector           | Task 3       |
| 6. harness scan             | Task 6       |
| 7. harness ingest           | Task 7       |
| 8. harness query            | Task 8       |
| 9. harness graph status     | Task 9       |
| 10. harness graph export    | Task 9       |
| 11. Build succeeds          | Task 12      |
| 12. Tests pass              | Task 12      |
