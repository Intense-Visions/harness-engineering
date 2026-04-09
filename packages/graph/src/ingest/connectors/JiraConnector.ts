import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    labels?: string[];
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
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

function appendJqlClause(jql: string, clause: string): string {
  return jql ? `${jql} AND ${clause}` : clause;
}

function buildJql(config: ConnectorConfig): string {
  const project = config.project as string | undefined;
  let jql = project ? `project=${project}` : '';
  const filters = config.filters as { status?: string[]; labels?: string[] } | undefined;
  if (filters?.status?.length) {
    jql = appendJqlClause(jql, `status IN (${filters.status.map((s) => `"${s}"`).join(',')})`);
  }
  if (filters?.labels?.length) {
    jql = appendJqlClause(jql, `labels IN (${filters.labels.map((l) => `"${l}"`).join(',')})`);
  }
  return jql;
}

export class JiraConnector implements GraphConnector {
  readonly name = 'jira';
  readonly source = 'jira';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();

    const apiKeyEnv = config.apiKeyEnv ?? 'JIRA_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return buildIngestResult(
        0,
        0,
        [`Missing API key: environment variable "${apiKeyEnv}" is not set`],
        start
      );
    }

    const baseUrlEnv = config.baseUrlEnv ?? 'JIRA_BASE_URL';
    const baseUrl = process.env[baseUrlEnv];
    if (!baseUrl) {
      return buildIngestResult(
        0,
        0,
        [`Missing base URL: environment variable "${baseUrlEnv}" is not set`],
        start
      );
    }

    const jql = buildJql(config);
    const headers = { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' };

    try {
      const counts = await this.fetchAllIssues(store, baseUrl, jql, headers);
      return buildIngestResult(counts.nodesAdded, counts.edgesAdded, [], start);
    } catch (err) {
      return buildIngestResult(
        0,
        0,
        [`Jira API error: ${err instanceof Error ? err.message : String(err)}`],
        start
      );
    }
  }

  private async fetchAllIssues(
    store: GraphStore,
    baseUrl: string,
    jql: string,
    headers: Record<string, string>
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    let nodesAdded = 0;
    let edgesAdded = 0;
    let startAt = 0;
    const maxResults = 50;
    let total = Infinity;

    while (startAt < total) {
      const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`;
      const response = await this.httpClient(url, { headers });
      if (!response.ok) throw new Error('Jira API request failed');
      const data = (await response.json()) as JiraSearchResponse;
      total = data.total;

      for (const issue of data.issues) {
        const counts = this.processIssue(store, issue);
        nodesAdded += counts.nodesAdded;
        edgesAdded += counts.edgesAdded;
      }
      startAt += maxResults;
    }

    return { nodesAdded, edgesAdded };
  }

  private processIssue(
    store: GraphStore,
    issue: JiraIssue
  ): { nodesAdded: number; edgesAdded: number } {
    const nodeId = `issue:jira:${issue.key}`;
    store.addNode({
      id: nodeId,
      type: 'issue',
      name: sanitizeExternalText(issue.fields.summary, 500),
      metadata: {
        key: issue.key,
        status: issue.fields.status?.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        labels: issue.fields.labels ?? [],
      },
    });

    const searchText = sanitizeExternalText(
      [issue.fields.summary, issue.fields.description ?? ''].join(' ')
    );
    const edgesAdded = linkToCode(store, searchText, nodeId, 'applies_to');

    return { nodesAdded: 1, edgesAdded };
  }
}
