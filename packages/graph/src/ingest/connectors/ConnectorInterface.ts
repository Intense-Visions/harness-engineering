import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';

export interface ConnectorConfig {
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  schedule?: string;
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
