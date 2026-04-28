import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, SyncMetadata } from './ConnectorInterface.js';
import { KnowledgeLinker } from '../KnowledgeLinker.js';

export class SyncManager {
  private readonly registrations = new Map<
    string,
    { connector: GraphConnector; config: ConnectorConfig }
  >();
  private readonly metadataPath: string;

  constructor(
    private readonly store: GraphStore,
    graphDir: string
  ) {
    this.metadataPath = path.join(graphDir, 'sync-metadata.json');
  }

  registerConnector(connector: GraphConnector, config: ConnectorConfig): void {
    this.registrations.set(connector.name, { connector, config });
  }

  async sync(connectorName: string): Promise<IngestResult> {
    const registration = this.registrations.get(connectorName);
    if (!registration) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Connector "${connectorName}" not registered`],
        durationMs: 0,
      };
    }

    const { connector, config } = registration;
    const result = await connector.ingest(this.store, config);

    // Update metadata
    const metadata = await this.loadMetadata();
    metadata.connectors[connectorName] = {
      lastSyncTimestamp: new Date().toISOString(),
      lastResult: result,
    };
    await this.saveMetadata(metadata);

    return result;
  }

  async syncAll(): Promise<IngestResult> {
    interface MutableIngestResult {
      nodesAdded: number;
      nodesUpdated: number;
      edgesAdded: number;
      edgesUpdated: number;
      errors: string[];
      durationMs: number;
    }

    const combined: MutableIngestResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 0,
    };

    for (const [name] of this.registrations) {
      const result = await this.sync(name);
      combined.nodesAdded += result.nodesAdded;
      combined.nodesUpdated += result.nodesUpdated;
      combined.edgesAdded += result.edgesAdded;
      combined.edgesUpdated += result.edgesUpdated;
      combined.errors.push(...result.errors);
      combined.durationMs += result.durationMs;
    }

    // Post-sync: run KnowledgeLinker once over the full graph to extract
    // business knowledge. Running it here (not per-connector) avoids O(N*C)
    // redundant scanning and inflated nodesAdded counts.
    try {
      const linker = new KnowledgeLinker(this.store);
      const linkResult = await linker.link();
      combined.nodesAdded += linkResult.factsCreated + linkResult.conceptsClustered;
      combined.errors.push(...linkResult.errors);
    } catch (err) {
      combined.errors.push(
        `KnowledgeLinker error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return combined as IngestResult;
  }

  async getMetadata(): Promise<SyncMetadata> {
    return this.loadMetadata();
  }

  private async loadMetadata(): Promise<SyncMetadata> {
    try {
      const raw = await fs.readFile(this.metadataPath, 'utf-8');
      return JSON.parse(raw) as SyncMetadata;
    } catch {
      return { connectors: {} };
    }
  }

  private async saveMetadata(metadata: SyncMetadata): Promise<void> {
    await fs.mkdir(path.dirname(this.metadataPath), { recursive: true });
    await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }
}
