import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * A pending human interaction, typically from an escalation.
 */
export interface PendingInteraction {
  /** Unique interaction ID */
  id: string;
  /** ID of the related issue */
  issueId: string;
  /** Interaction type */
  type: 'needs-human';
  /** Reasons for escalation */
  reasons: string[];
  /** Context for the human */
  context: {
    issueTitle: string;
    issueDescription: string | null;
    specPath: string | null;
    planPath: string | null;
    relatedFiles: string[];
    /** Enriched spec from intelligence pipeline, if available */
    enrichedSpec?: {
      intent: string;
      summary: string;
      affectedSystems: unknown[];
      unknowns: string[];
      ambiguities: string[];
      riskSignals: string[];
    };
    /** Complexity score from intelligence pipeline, if available */
    complexityScore?: {
      overall: number;
      confidence: number;
      riskLevel: string;
      blastRadius: {
        services: number;
        modules: number;
        filesEstimated: number;
        testFilesAffected: number;
      };
      dimensions: {
        structural: number;
        semantic: number;
        historical: number;
      };
      reasoning: string[];
      recommendedRoute: string;
    };
  };
  /** ISO timestamp of creation */
  createdAt: string;
  /** Current status */
  status: 'pending' | 'claimed' | 'resolved';
}

/**
 * Persistent queue of pending human interactions.
 * Each interaction is stored as a separate JSON file in the configured directory.
 */
export class InteractionQueue {
  private dir: string;
  private pushListeners: Array<(interaction: PendingInteraction) => void> = [];

  /**
   * @param dir - Directory path for storing interaction JSON files
   */
  constructor(dir: string) {
    this.dir = dir;
  }

  /**
   * Register a listener that fires after each push.
   */
  onPush(listener: (interaction: PendingInteraction) => void): void {
    this.pushListeners.push(listener);
  }

  /**
   * Push a new interaction to the queue.
   */
  async push(interaction: PendingInteraction): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${interaction.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(interaction, null, 2), 'utf-8');
    for (const listener of this.pushListeners) {
      listener(interaction);
    }
  }

  /**
   * List all interactions (regardless of status).
   */
  async list(): Promise<PendingInteraction[]> {
    try {
      const files = await fs.readdir(this.dir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const interactions: PendingInteraction[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(this.dir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        interactions.push(JSON.parse(raw) as PendingInteraction);
      }

      return interactions;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * List only pending interactions.
   */
  async listPending(): Promise<PendingInteraction[]> {
    const all = await this.list();
    return all.filter((i) => i.status === 'pending');
  }

  /**
   * Update the status of an interaction.
   */
  async updateStatus(id: string, status: PendingInteraction['status']): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Interaction ${id} not found`, { cause: err });
      }
      throw err;
    }
    const interaction = JSON.parse(raw) as PendingInteraction;
    interaction.status = status;
    await fs.writeFile(filePath, JSON.stringify(interaction, null, 2), 'utf-8');
  }
}
