import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';

export type HttpClient = (
  url: string,
  options?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export interface ConnectorConfig {
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  schedule?: string;
  lookbackDays?: number;
  filters?: Record<string, unknown>;
  maxContentLength?: number;
  [key: string]: unknown;
}

export interface GraphConnector {
  readonly name: string;
  readonly source: string;
  ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult>;
}

export interface SyncMetadata {
  connectors: Record<
    string,
    {
      lastSyncTimestamp: string;
      lastResult: IngestResult;
    }
  >;
}
