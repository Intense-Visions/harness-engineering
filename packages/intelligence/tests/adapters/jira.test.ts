import { describe, it, expect } from 'vitest';
import { jiraToRawWorkItem, type JiraIssue } from '../../src/adapters/jira.js';

function makeJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: '10042',
    key: 'PROJ-42',
    fields: {
      summary: 'Fix authentication timeout',
      description: 'Users are experiencing session timeouts after 5 minutes.',
      labels: ['bug', 'auth'],
      priority: { id: '2', name: 'High' },
      status: { id: '3', name: 'In Progress' },
      issuetype: { id: '1', name: 'Bug' },
      created: '2026-04-10T10:00:00.000+0000',
      updated: '2026-04-14T12:00:00.000+0000',
      issuelinks: [
        { type: { name: 'Blocks' }, inwardIssue: { id: '10001', key: 'PROJ-10' } },
        { type: { name: 'Relates' }, outwardIssue: { id: '10002', key: 'PROJ-11' } },
      ],
      comment: {
        comments: [
          { body: 'Reproduced on staging', author: { displayName: 'Alice' } },
          { body: 'Investigating root cause', author: { displayName: 'Bob' } },
        ],
      },
    },
    ...overrides,
  };
}

describe('jiraToRawWorkItem', () => {
  it('maps all JIRA fields correctly', () => {
    const jira = makeJiraIssue();
    const raw = jiraToRawWorkItem(jira);

    expect(raw.id).toBe('10042');
    expect(raw.title).toBe('Fix authentication timeout');
    expect(raw.description).toBe('Users are experiencing session timeouts after 5 minutes.');
    expect(raw.labels).toEqual(['bug', 'auth']);
    expect(raw.source).toBe('jira');
    expect(raw.comments).toEqual(['Reproduced on staging', 'Investigating root cause']);
    expect(raw.linkedItems).toEqual(['10001', '10002']);
    expect(raw.metadata).toEqual({
      key: 'PROJ-42',
      priority: { id: '2', name: 'High' },
      status: { id: '3', name: 'In Progress' },
      issuetype: { id: '1', name: 'Bug' },
      created: '2026-04-10T10:00:00.000+0000',
      updated: '2026-04-14T12:00:00.000+0000',
    });
  });

  it('handles null description', () => {
    const jira = makeJiraIssue();
    jira.fields.description = null;
    const raw = jiraToRawWorkItem(jira);
    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const jira = makeJiraIssue();
    jira.fields.labels = [];
    const raw = jiraToRawWorkItem(jira);
    expect(raw.labels).toEqual([]);
  });

  it('handles missing issuelinks', () => {
    const jira = makeJiraIssue();
    jira.fields.issuelinks = [];
    const raw = jiraToRawWorkItem(jira);
    expect(raw.linkedItems).toEqual([]);
  });

  it('handles missing comments', () => {
    const jira = makeJiraIssue();
    jira.fields.comment = { comments: [] };
    const raw = jiraToRawWorkItem(jira);
    expect(raw.comments).toEqual([]);
  });

  it('extracts linked issue IDs from both inward and outward links', () => {
    const jira = makeJiraIssue({
      fields: {
        ...makeJiraIssue().fields,
        issuelinks: [
          { type: { name: 'Blocks' }, inwardIssue: { id: '10001', key: 'PROJ-10' } },
          { type: { name: 'Blocks' }, outwardIssue: { id: '10002', key: 'PROJ-11' } },
          { type: { name: 'Duplicate' }, inwardIssue: { id: '10003', key: 'PROJ-12' } },
        ],
      },
    });
    const raw = jiraToRawWorkItem(jira);
    expect(raw.linkedItems).toEqual(['10001', '10002', '10003']);
  });
});
