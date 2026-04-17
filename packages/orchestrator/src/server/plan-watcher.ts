import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InteractionQueue } from '../core/interaction-queue';

/**
 * Watches the plans directory for new .md files and auto-resolves
 * matching pending interactions in the InteractionQueue.
 *
 * A plan file "matches" an interaction if the filename contains the
 * interaction's issueId (case-insensitive comparison).
 */
export class PlanWatcher {
  private plansDir: string;
  private queue: InteractionQueue;
  private watcher: fs.FSWatcher | null = null;

  constructor(plansDir: string, queue: InteractionQueue) {
    this.plansDir = plansDir;
    this.queue = queue;
  }

  /**
   * Start watching the plans directory.
   * Creates the directory if it does not exist.
   */
  start(): void {
    // Ensure directory exists
    fs.mkdirSync(this.plansDir, { recursive: true });

    this.watcher = fs.watch(this.plansDir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.md')) {
        // 'rename' fires on file creation. Verify the file actually exists.
        const filePath = path.join(this.plansDir, filename);
        if (fs.existsSync(filePath)) {
          void this.handleNewPlan(filename);
        }
      }
    });
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleNewPlan(filename: string): Promise<void> {
    const upperFilename = filename.toUpperCase();

    try {
      const pending = await this.queue.listPending();

      for (const interaction of pending) {
        const upperIssueId = interaction.issueId.toUpperCase();
        if (upperFilename.includes(upperIssueId)) {
          await this.queue.updateStatus(interaction.id, 'resolved');
        }
      }
    } catch {
      // Silently ignore errors -- watcher is best-effort
    }
  }
}
