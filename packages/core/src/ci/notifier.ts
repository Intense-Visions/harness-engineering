import type { CICheckReport, CINotifyOptions } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { TrackerSyncAdapter } from '../roadmap/tracker-sync';
import { formatCIReportAsMarkdown } from './report-formatter';

/**
 * Bridges CI check reports to external issue trackers.
 * Posts formatted reports as PR comments or creates issues
 * using the existing TrackerSyncAdapter interface.
 */
export class CINotifier {
  constructor(
    private readonly adapter: TrackerSyncAdapter,
    private readonly repo: string
  ) {}

  /**
   * Post a CI report as a comment on an existing PR/issue.
   * Uses the adapter's addComment method with the PR's external ID.
   */
  async notifyPR(report: CICheckReport, prNumber: number): Promise<Result<void>> {
    const markdown = formatCIReportAsMarkdown(report);
    const externalId = `github:${this.repo}#${prNumber}`;
    return this.adapter.addComment(externalId, markdown);
  }

  /**
   * Create a new issue from a CI report.
   * Only creates when the report contains failures or warnings.
   * Returns the created ticket's external ID and URL.
   */
  async notifyIssue(
    report: CICheckReport,
    options?: Pick<CINotifyOptions, 'issueTitle' | 'labels'>
  ): Promise<Result<{ externalId: string; url: string }>> {
    if (report.exitCode === 0) {
      return Err(new Error('Report has no failures — skipping issue creation'));
    }

    const title =
      options?.issueTitle ?? `CI: ${report.summary.failed} check(s) failed in ${report.project}`;
    const markdown = formatCIReportAsMarkdown(report);

    const feature = {
      name: title,
      summary: markdown,
      status: 'planned' as const,
      spec: null,
      plans: [] as string[],
      blockedBy: [] as string[],
      assignee: null,
      priority: null,
      externalId: null,
    };

    const result = await this.adapter.createTicket(feature, 'CI Issues');
    if (!result.ok) return result;

    return Ok({ externalId: result.value.externalId, url: result.value.url });
  }
}
