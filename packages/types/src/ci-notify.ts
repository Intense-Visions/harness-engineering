/**
 * Target for CI notification delivery.
 */
export type CINotifyTarget = 'pr-comment' | 'issue';

/**
 * Options for the CI notify command.
 */
export interface CINotifyOptions {
  /** Where to post the notification */
  target: CINotifyTarget;
  /** PR number (required when target is 'pr-comment') */
  pr?: number;
  /** Custom title for created issues (default: derived from report) */
  issueTitle?: string;
  /** Labels to add to created issues */
  labels?: string[];
}
