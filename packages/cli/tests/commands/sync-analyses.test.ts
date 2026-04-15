import { describe, it, expect, vi } from 'vitest';
import { extractAnalysisFromComments } from '../../src/commands/sync-analyses';
import { renderAnalysisComment } from '@harness-engineering/orchestrator';
import type { TrackerComment } from '@harness-engineering/types';
import type { AnalysisRecord } from '@harness-engineering/orchestrator';

function makeComment(overrides: Partial<TrackerComment> = {}): TrackerComment {
  return {
    id: '1',
    body: '',
    createdAt: '2026-04-15T12:00:00Z',
    updatedAt: null,
    author: 'bot',
    ...overrides,
  };
}

function makeAnalysisBody(record: Record<string, unknown>): string {
  return [
    '## Harness Analysis: test-feature',
    '',
    '<details>',
    '<summary>Full Analysis Data</summary>',
    '',
    '```json',
    JSON.stringify({ _harness_analysis: true, _version: 1, ...record }, null, 2),
    '```',
    '',
    '</details>',
  ].join('\n');
}

describe('extractAnalysisFromComments', () => {
  it('extracts AnalysisRecord from a valid analysis comment', () => {
    const record = {
      issueId: 'issue-1',
      identifier: 'test-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    };
    const comments = [makeComment({ body: makeAnalysisBody(record) })];
    const result = extractAnalysisFromComments(comments);
    expect(result).not.toBeNull();
    expect(result!.issueId).toBe('issue-1');
    expect(result!.identifier).toBe('test-feature');
    expect(result!.externalId).toBe('github:owner/repo#1');
  });

  it('returns null when no comments contain _harness_analysis', () => {
    const comments = [
      makeComment({ body: 'Just a regular comment' }),
      makeComment({ body: '```json\n{ "something": true }\n```' }),
    ];
    expect(extractAnalysisFromComments(comments)).toBeNull();
  });

  it('takes the most recent analysis comment when multiple exist', () => {
    const olderRecord = {
      issueId: 'issue-1',
      identifier: 'old-analysis',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-10T12:00:00Z',
      externalId: 'github:owner/repo#1',
    };
    const newerRecord = {
      issueId: 'issue-1',
      identifier: 'new-analysis',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    };
    const comments = [
      makeComment({
        id: '1',
        body: makeAnalysisBody(olderRecord),
        createdAt: '2026-04-10T12:00:00Z',
      }),
      makeComment({
        id: '2',
        body: makeAnalysisBody(newerRecord),
        createdAt: '2026-04-15T12:00:00Z',
      }),
    ];
    const result = extractAnalysisFromComments(comments);
    expect(result).not.toBeNull();
    expect(result!.identifier).toBe('new-analysis');
  });

  it('warns and returns null on malformed JSON in analysis fence', () => {
    const body = [
      '## Harness Analysis: broken',
      '',
      '```json',
      '{ "_harness_analysis": true, INVALID JSON',
      '```',
    ].join('\n');
    const comments = [makeComment({ body })];
    // Should not throw -- returns null (malformed)
    const result = extractAnalysisFromComments(comments);
    expect(result).toBeNull();
  });

  it('returns null for empty comments array', () => {
    expect(extractAnalysisFromComments([])).toBeNull();
  });

  it('handles CRLF line endings in the JSON fence', () => {
    const record = {
      issueId: 'crlf-1',
      identifier: 'crlf-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#50',
    };
    // Build body with \r\n line endings
    const body = [
      '## Harness Analysis: crlf-feature',
      '',
      '<details>',
      '<summary>Full Analysis Data</summary>',
      '',
      '```json',
      JSON.stringify({ _harness_analysis: true, _version: 1, ...record }, null, 2),
      '```',
      '',
      '</details>',
    ].join('\r\n');
    const comments = [makeComment({ body })];
    const result = extractAnalysisFromComments(comments);
    expect(result).not.toBeNull();
    expect(result!.issueId).toBe('crlf-1');
    expect(result!.identifier).toBe('crlf-feature');
  });

  it('strips _harness_analysis and _version discriminator fields from the returned record', () => {
    const record = {
      issueId: 'issue-1',
      identifier: 'test-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    };
    const comments = [makeComment({ body: makeAnalysisBody(record) })];
    const result = extractAnalysisFromComments(comments);
    expect(result).not.toBeNull();
    expect((result as any)._harness_analysis).toBeUndefined();
    expect((result as any)._version).toBeUndefined();
  });

  it('rejects records where issueId contains path traversal characters', () => {
    const body = makeAnalysisBody({
      issueId: '../etc/passwd',
      identifier: 'traversal-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    });
    const comments = [makeComment({ body })];
    expect(extractAnalysisFromComments(comments)).toBeNull();
  });

  it('rejects records where issueId contains backslash path traversal', () => {
    const body = makeAnalysisBody({
      issueId: '..\\windows\\system32',
      identifier: 'traversal-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    });
    const comments = [makeComment({ body })];
    expect(extractAnalysisFromComments(comments)).toBeNull();
  });

  it('rejects records with empty issueId', () => {
    const body = makeAnalysisBody({
      issueId: '',
      identifier: 'missing-id-feature',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    });
    const comments = [makeComment({ body })];
    expect(extractAnalysisFromComments(comments)).toBeNull();
  });

  it('rejects records with missing identifier', () => {
    const body = makeAnalysisBody({
      issueId: 'issue-1',
      identifier: '',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-04-15T12:00:00Z',
      externalId: 'github:owner/repo#1',
    });
    const comments = [makeComment({ body })];
    expect(extractAnalysisFromComments(comments)).toBeNull();
  });

  it('finds analysis fence among multiple JSON fences in a single comment', () => {
    const body = [
      '## Status Update',
      '',
      '```json',
      JSON.stringify({ status: 'in-progress', estimate: 5 }),
      '```',
      '',
      'And here is the analysis:',
      '',
      '```json',
      JSON.stringify(
        {
          _harness_analysis: true,
          _version: 1,
          issueId: 'multi-fence-1',
          identifier: 'multi-fence-feature',
          spec: null,
          score: null,
          simulation: null,
          analyzedAt: '2026-04-15T12:00:00Z',
          externalId: 'github:owner/repo#77',
        },
        null,
        2
      ),
      '```',
    ].join('\n');
    const comments = [makeComment({ body })];
    const result = extractAnalysisFromComments(comments);
    expect(result).not.toBeNull();
    expect(result!.issueId).toBe('multi-fence-1');
    expect(result!.identifier).toBe('multi-fence-feature');
  });
});

describe('createSyncAnalysesCommand', () => {
  it('exports a Commander command named sync-analyses', async () => {
    const { createSyncAnalysesCommand } = await import('../../src/commands/sync-analyses');
    const cmd = createSyncAnalysesCommand();
    expect(cmd.name()).toBe('sync-analyses');
  });
});

describe('round-trip: renderAnalysisComment -> extractAnalysisFromComments', () => {
  it('extracts a record that matches the original after publish rendering', () => {
    const original: AnalysisRecord = {
      issueId: 'roundtrip-1',
      identifier: 'roundtrip-feature',
      spec: null,
      score: {
        overall: 0.7,
        confidence: 0.85,
        riskLevel: 'medium',
        blastRadius: { filesEstimated: 3, modules: 1, services: 1 },
        dimensions: { structural: 0.6, semantic: 0.7, historical: 0.5 },
        reasoning: ['Touches core module'],
        recommendedRoute: 'human',
      },
      simulation: null,
      analyzedAt: '2026-04-15T14:00:00Z',
      externalId: 'github:owner/repo#99',
    };

    const commentBody = renderAnalysisComment(original);
    const fakeComment: TrackerComment = {
      id: '100',
      body: commentBody,
      createdAt: '2026-04-15T14:00:00Z',
      updatedAt: null,
      author: 'harness-bot',
    };

    const extracted = extractAnalysisFromComments([fakeComment]);
    expect(extracted).not.toBeNull();
    expect(extracted!.issueId).toBe(original.issueId);
    expect(extracted!.identifier).toBe(original.identifier);
    expect(extracted!.externalId).toBe(original.externalId);
    expect(extracted!.analyzedAt).toBe(original.analyzedAt);
    expect(extracted!.score?.riskLevel).toBe(original.score!.riskLevel);
    expect(extracted!.score?.confidence).toBe(original.score!.confidence);
    expect(extracted!.score?.recommendedRoute).toBe(original.score!.recommendedRoute);
  });
});

describe('full round-trip: render -> addComment -> fetchComments -> extract', () => {
  it('publishes via addComment mock, fetches back, and extracts a matching record', async () => {
    const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

    const original: AnalysisRecord = {
      issueId: 'full-rt-1',
      identifier: 'full-roundtrip-feature',
      spec: null,
      score: {
        overall: 0.72,
        confidence: 0.88,
        riskLevel: 'medium',
        blastRadius: { filesEstimated: 4, modules: 2, services: 1 },
        dimensions: { structural: 0.6, semantic: 0.75, historical: 0.55 },
        reasoning: ['Modifies shared interface', 'Limited test coverage in target module'],
        recommendedRoute: 'human',
      },
      simulation: null,
      analyzedAt: '2026-04-15T16:00:00Z',
      externalId: 'github:owner/repo#88',
    };

    // Step 1: Render the comment as the publish flow would
    const commentBody = renderAnalysisComment(original);

    // Step 2: Simulate addComment capturing the body, then fetchComments returning it
    // We create one adapter for addComment (POST mock) and one for fetchComments (GET mock)
    let capturedBody = '';
    const addCommentFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      text: async () => '{}',
      json: async () => ({}),
    });

    const publishAdapter = new GitHubIssuesSyncAdapter({
      token: 'tok',
      config: {
        kind: 'github' as const,
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
      fetchFn: addCommentFetch,
    });

    const addResult = await publishAdapter.addComment(original.externalId!, commentBody);
    expect(addResult.ok).toBe(true);

    // Extract what was POSTed
    const postCall = addCommentFetch.mock.calls[0]!;
    capturedBody = JSON.parse(postCall[1].body as string).body;
    expect(capturedBody).toBe(commentBody);

    // Step 3: Simulate fetchComments returning the published comment
    const fetchCommentsFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify([
          {
            id: 500,
            body: capturedBody,
            created_at: '2026-04-15T16:01:00Z',
            updated_at: null,
            user: { login: 'harness-bot' },
          },
        ]),
      json: async () => [
        {
          id: 500,
          body: capturedBody,
          created_at: '2026-04-15T16:01:00Z',
          updated_at: null,
          user: { login: 'harness-bot' },
        },
      ],
    });

    const pullAdapter = new GitHubIssuesSyncAdapter({
      token: 'tok',
      config: {
        kind: 'github' as const,
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
      fetchFn: fetchCommentsFetch,
    });

    const fetchResult = await pullAdapter.fetchComments(original.externalId!);
    expect(fetchResult.ok).toBe(true);
    if (!fetchResult.ok) return;

    // Step 4: Extract the analysis from the fetched comments
    const extracted = extractAnalysisFromComments(fetchResult.value);
    expect(extracted).not.toBeNull();

    // Step 5: Compare every AnalysisRecord field
    expect(extracted!.issueId).toBe(original.issueId);
    expect(extracted!.identifier).toBe(original.identifier);
    expect(extracted!.spec).toBe(original.spec);
    expect(extracted!.analyzedAt).toBe(original.analyzedAt);
    expect(extracted!.externalId).toBe(original.externalId);
    expect(extracted!.simulation).toBe(original.simulation);

    // Deep-compare score
    expect(extracted!.score).not.toBeNull();
    expect(extracted!.score!.overall).toBe(original.score!.overall);
    expect(extracted!.score!.confidence).toBe(original.score!.confidence);
    expect(extracted!.score!.riskLevel).toBe(original.score!.riskLevel);
    expect(extracted!.score!.recommendedRoute).toBe(original.score!.recommendedRoute);
    expect(extracted!.score!.reasoning).toEqual(original.score!.reasoning);
    expect(extracted!.score!.blastRadius).toEqual(original.score!.blastRadius);
    expect(extracted!.score!.dimensions).toEqual(original.score!.dimensions);

    // Ensure discriminator fields are stripped
    expect((extracted as any)._harness_analysis).toBeUndefined();
    expect((extracted as any)._version).toBeUndefined();
  });
});
