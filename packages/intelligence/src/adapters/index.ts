export { jiraToRawWorkItem } from './jira.js';
export type { JiraIssue, JiraIssueLink, JiraComment } from './jira.js';

export { githubToRawWorkItem } from './github.js';
export type { GitHubIssue, GitHubLabel, GitHubComment } from './github.js';

export { linearToRawWorkItem } from './linear.js';
export type { LinearIssue, LinearLabel, LinearComment, LinearRelation } from './linear.js';

export { manualToRawWorkItem } from './manual.js';
export type { ManualInput } from './manual.js';

export { createCanaryAdapter, canaryRunRecordSchema, canaryTestResultSchema } from './canary.js';
export type {
  CanaryAdapter,
  CanaryProbe,
  CanaryDegradeReason,
  CanaryExec,
  CanaryReader,
  FrameworkRecommendation,
  CanaryFinding,
  CanaryRunRecord,
  CanaryTestResult,
} from './canary.js';
