import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode } from './ConnectorUtils.js';

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

export class JiraConnector implements GraphConnector {
  readonly name = 'jira';
  readonly source = 'jira';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'JIRA_API_KEY';
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

    const baseUrlEnv = config.baseUrlEnv ?? 'JIRA_BASE_URL';
    const baseUrl = process.env[baseUrlEnv];
    if (!baseUrl) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Missing base URL: environment variable "${baseUrlEnv}" is not set`],
        durationMs: Date.now() - start,
      };
    }

    // S-2: Build JQL with optional filters
    const project = config.project as string | undefined;
    let jql = project ? `project=${project}` : '';
    const filters = config.filters as { status?: string[]; labels?: string[] } | undefined;
    if (filters?.status?.length) {
      jql += `${jql ? ' AND ' : ''}status IN (${filters.status.map((s) => `"${s}"`).join(',')})`;
    }
    if (filters?.labels?.length) {
      jql += `${jql ? ' AND ' : ''}labels IN (${filters.labels.map((l) => `"${l}"`).join(',')})`;
    }

    const headers = {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // S-3: Pagination loop
    let startAt = 0;
    const maxResults = 50;
    let total = Infinity;

    try {
      while (startAt < total) {
        const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`;
        const response = await this.httpClient(url, { headers });
        if (!response.ok) {
          return {
            nodesAdded,
            nodesUpdated: 0,
            edgesAdded,
            edgesUpdated: 0,
            errors: ['Jira API request failed'],
            durationMs: Date.now() - start,
          };
        }
        const data = (await response.json()) as JiraSearchResponse;
        total = data.total;

        for (const issue of data.issues) {
          const nodeId = `issue:jira:${issue.key}`;
          store.addNode({
            id: nodeId,
            type: 'issue',
            name: issue.fields.summary,
            metadata: {
              key: issue.key,
              status: issue.fields.status?.name,
              priority: issue.fields.priority?.name,
              assignee: issue.fields.assignee?.displayName,
              labels: issue.fields.labels ?? [],
            },
          });
          nodesAdded++;

          // Link to code nodes via shared utility
          const searchText = [issue.fields.summary, issue.fields.description ?? ''].join(' ');
          edgesAdded += linkToCode(store, searchText, nodeId, 'applies_to');
        }

        startAt += maxResults;
      }
    } catch (err) {
      return {
        nodesAdded,
        nodesUpdated: 0,
        edgesAdded,
        edgesUpdated: 0,
        errors: [`Jira API error: ${err instanceof Error ? err.message : String(err)}`],
        durationMs: Date.now() - start,
      };
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
