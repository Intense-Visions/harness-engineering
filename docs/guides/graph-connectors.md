# Graph Connectors

## Overview

Graph connectors pull data from external services -- Jira, Slack, Confluence, and
GitHub Actions -- and ingest it into the project knowledge graph. Each connector
creates typed nodes (issues, conversations, documents, builds) and automatically
links them to existing code nodes when keywords or file paths appear in the
ingested text. This cross-referencing lets agents reason about relationships
between code, tickets, discussions, and CI results in a single graph.

Every connector implements the `GraphConnector` interface defined in
`packages/graph/src/ingest/connectors/ConnectorInterface.ts`:

```ts
interface GraphConnector {
  readonly name: string;
  readonly source: string;
  ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult>;
}
```

## Configuration

Connectors are declared in the `graph.connectors` section of
`harness.config.json`. Each entry specifies the connector type and its
options.

> **Note:** The `graph.connectors` configuration is consumed directly by the
> graph package's `SyncManager` but is not yet validated by the CLI config
> schema. Unrecognized keys are passed through without errors.

```jsonc
{
  "graph": {
    "connectors": {
      "jira": {
        "apiKeyEnv": "JIRA_API_KEY",
        "baseUrlEnv": "JIRA_BASE_URL",
        "project": "ENG",
        "filters": { "status": ["In Progress", "In Review"], "labels": ["backend"] },
        "schedule": "0 */4 * * *",
      },
      "slack": {
        "apiKeyEnv": "SLACK_API_KEY",
        "channels": ["C01ABCDEF", "C02GHIJKL"],
        "lookbackDays": 14,
      },
      "confluence": {
        "apiKeyEnv": "CONFLUENCE_API_KEY",
        "baseUrlEnv": "CONFLUENCE_BASE_URL",
        "spaceKey": "ENG",
      },
      "ci": {
        "apiKeyEnv": "GITHUB_TOKEN",
        "repo": "my-org/my-repo",
        "maxRuns": 20,
      },
    },
  },
}
```

All `apiKeyEnv` and `baseUrlEnv` fields name environment variables -- the
connector reads the actual secret from `process.env` at runtime, so credentials
never appear in config files.

## Jira Setup

| Field            | Default         | Description                                                                 |
| ---------------- | --------------- | --------------------------------------------------------------------------- |
| `apiKeyEnv`      | `JIRA_API_KEY`  | Env var holding the Base64-encoded `user:token` string                      |
| `baseUrlEnv`     | `JIRA_BASE_URL` | Env var holding the Jira instance URL (e.g. `https://myteam.atlassian.net`) |
| `project`        | _(none)_        | Jira project key to scope the JQL query (e.g. `ENG`)                        |
| `filters.status` | _(none)_        | Array of status names to filter by                                          |
| `filters.labels` | _(none)_        | Array of labels to filter by                                                |
| `schedule`       | _(none)_        | Cron expression for periodic sync                                           |

The connector paginates through the Jira search API (`/rest/api/2/search`) in
batches of 50. Each issue becomes an `issue` node with metadata for key, status,
priority, assignee, and labels. Issue summaries and descriptions are scanned for
code references and linked via `applies_to` edges.

## Slack Setup

| Field          | Default         | Description                                   |
| -------------- | --------------- | --------------------------------------------- |
| `apiKeyEnv`    | `SLACK_API_KEY` | Env var holding the Slack Bot OAuth token     |
| `channels`     | `[]`            | Array of Slack channel IDs to ingest          |
| `lookbackDays` | _(none)_        | Only fetch messages newer than this many days |

Each message becomes a `conversation` node (truncated to 100 chars for the node
name). The connector calls `conversations.history` for each channel. Message
text is scanned for file-path references and linked to code nodes via
`references` edges.

## Confluence Setup

| Field        | Default               | Description                               |
| ------------ | --------------------- | ----------------------------------------- |
| `apiKeyEnv`  | `CONFLUENCE_API_KEY`  | Env var holding the Confluence API token  |
| `baseUrlEnv` | `CONFLUENCE_BASE_URL` | Env var holding the Confluence base URL   |
| `spaceKey`   | `""`                  | Confluence space key to ingest pages from |

Pages are fetched from the v2 API (`/wiki/api/v2/pages`) with automatic cursor
pagination. Each page becomes a `document` node. Page titles and body content
are matched against code nodes and linked via `documents` edges.

## CI (GitHub Actions) Setup

| Field       | Default        | Description                                    |
| ----------- | -------------- | ---------------------------------------------- |
| `apiKeyEnv` | `GITHUB_TOKEN` | Env var holding a GitHub personal access token |
| `repo`      | `""`           | Repository in `owner/repo` format              |
| `maxRuns`   | `10`           | Maximum number of workflow runs to fetch       |

The connector fetches recent workflow runs from the GitHub Actions API. Each run
becomes a `build` node. If a matching `commit` node already exists in the graph,
a `triggered_by` edge is created. Failed runs also produce a `test_result` node
linked to the build via a `failed_in` edge.

## SyncManager

The `SyncManager` class orchestrates connector execution and tracks sync
history. It lives at
`packages/graph/src/ingest/connectors/SyncManager.ts`.

Key behaviors:

- **Registration** -- Call `registerConnector(connector, config)` to make a
  connector available for syncing.
- **Single sync** -- `sync("jira")` runs one connector's `ingest()` method,
  then writes results to the metadata file.
- **Full sync** -- `syncAll()` iterates over every registered connector
  sequentially and returns a combined `IngestResult`.
- **Metadata persistence** -- After each sync, results are written to
  `sync-metadata.json` inside the graph directory. The file records
  `lastSyncTimestamp` and `lastResult` per connector:

```json
{
  "connectors": {
    "jira": {
      "lastSyncTimestamp": "2026-03-18T12:00:00.000Z",
      "lastResult": {
        "nodesAdded": 42,
        "nodesUpdated": 0,
        "edgesAdded": 15,
        "edgesUpdated": 0,
        "errors": [],
        "durationMs": 1200
      }
    }
  }
}
```

If `sync-metadata.json` does not exist yet, the SyncManager initializes an
empty metadata object -- no manual setup is required.

## Troubleshooting

**Missing API key** -- The connector returns immediately with an error like
`Missing API key: environment variable "JIRA_API_KEY" is not set`. Verify the
env var is exported in your shell or CI environment before running sync.

**Missing base URL** -- Jira and Confluence connectors also require a base URL
env var. The error message names the specific variable that is missing.

**API request failures** -- A non-OK HTTP response is reported as
`<Service> API error: status <code>`. Check that your token has the required
scopes and that the base URL is correct (no trailing slash).

**Rate limits** -- All connectors use a single sequential request pattern. If
you hit rate limits, reduce `maxRuns`, narrow `filters`, limit `channels`, or
increase the `schedule` interval to spread load over time.

**No edges created** -- Edges are only created when ingested text contains
keywords or file paths matching existing code nodes in the graph. Run a code
ingest first (`harness scan`) before syncing external connectors.

**Stale sync-metadata.json** -- The file is safe to delete. The SyncManager
will recreate it on the next sync run.
