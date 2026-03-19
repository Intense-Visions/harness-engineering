import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  html_url: string;
  created_at: string;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

export class CIConnector implements GraphConnector {
  readonly name = 'ci';
  readonly source = 'github-actions';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'GITHUB_TOKEN';
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

    const repo = (config.repo as string) ?? '';
    const maxRuns = (config.maxRuns as number) ?? 10;

    try {
      const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=${maxRuns}`;
      const response = await this.httpClient(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/vnd.github.v3+json' },
      });

      if (!response.ok) {
        errors.push(`GitHub Actions API error: status ${response.status}`);
        return {
          nodesAdded: 0,
          nodesUpdated: 0,
          edgesAdded: 0,
          edgesUpdated: 0,
          errors,
          durationMs: Date.now() - start,
        };
      }

      const data = (await response.json()) as WorkflowRunsResponse;

      for (const run of data.workflow_runs) {
        // Create build node
        const buildId = `build:${run.id}`;
        store.addNode({
          id: buildId,
          type: 'build',
          name: `${run.name} #${run.id}`,
          metadata: {
            source: 'github-actions',
            status: run.status,
            conclusion: run.conclusion,
            branch: run.head_branch,
            sha: run.head_sha,
            url: run.html_url,
            createdAt: run.created_at,
          },
        });
        nodesAdded++;

        // Link build to commit node if it exists
        const commitNode = store.getNode(`commit:${run.head_sha}`);
        if (commitNode) {
          store.addEdge({ from: buildId, to: commitNode.id, type: 'triggered_by' });
          edgesAdded++;
        }

        // For failed runs, create a test_result node linked to the build.
        // Per-file failure linking (test_result --failed_in--> file) would require
        // fetching job logs via additional API calls — deferred to future enhancement.
        if (run.conclusion === 'failure') {
          const testResultId = `test_result:${run.id}`;
          store.addNode({
            id: testResultId,
            type: 'test_result',
            name: `Failed: ${run.name} #${run.id}`,
            metadata: {
              source: 'github-actions',
              buildId: String(run.id),
              conclusion: 'failure',
              branch: run.head_branch,
              sha: run.head_sha,
            },
          });
          nodesAdded++;

          // Link test_result to build
          store.addEdge({ from: testResultId, to: buildId, type: 'failed_in' });
          edgesAdded++;
        }
      }
    } catch (err) {
      errors.push(
        `GitHub Actions fetch error: ${err instanceof Error ? err.message : String(err)}`
      );
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
