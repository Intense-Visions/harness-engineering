import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  EnrichedSpec,
  ComplexityScore,
  SimulationResult,
} from '@harness-engineering/intelligence';

/**
 * A persisted record of a single intelligence pipeline analysis run.
 */
export interface AnalysisRecord {
  /** Issue ID this analysis belongs to */
  issueId: string;
  /** Issue identifier (human-readable) */
  identifier: string;
  /** Enriched spec from SEL, or null if skipped */
  spec: EnrichedSpec | null;
  /** Complexity score from CML, or null if skipped */
  score: ComplexityScore | null;
  /** PESL simulation result, or null if not run */
  simulation: SimulationResult | null;
  /** ISO timestamp when this analysis was recorded */
  analyzedAt: string;
  /** External tracker ID (e.g., "github:owner/repo#42"), populated at analysis time. Null if no tracker configured. */
  externalId: string | null;
}

/**
 * Persistent archive of intelligence pipeline analysis results.
 * Each analysis is stored as a separate JSON file keyed by issue ID.
 * Overwrites previous analysis for the same issue (latest result wins).
 */
export class AnalysisArchive {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /**
   * Write an analysis record to disk, overwriting any previous record for the same issue.
   */
  async save(record: AnalysisRecord): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${record.issueId}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /**
   * Read the analysis record for a specific issue.
   */
  async get(issueId: string): Promise<AnalysisRecord | null> {
    const filePath = path.join(this.dir, `${issueId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const record = JSON.parse(raw) as AnalysisRecord;
      record.externalId ??= null;
      return record;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * List all archived analysis records.
   */
  async list(): Promise<AnalysisRecord[]> {
    try {
      const files = await fs.readdir(this.dir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const records: AnalysisRecord[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(this.dir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        const record = JSON.parse(raw) as AnalysisRecord;
        record.externalId ??= null;
        records.push(record);
      }

      return records;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
}
