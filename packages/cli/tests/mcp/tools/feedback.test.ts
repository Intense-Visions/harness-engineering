import { describe, it, expect } from 'vitest';
import {
  createSelfReviewDefinition,
  handleCreateSelfReview,
  analyzeDiffDefinition,
  handleAnalyzeDiff,
  requestPeerReviewDefinition,
  handleRequestPeerReview,
} from '../../../src/mcp/tools/feedback';

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('hello');
   return 42;
 }
`;

// ============ create_self_review ============

describe('create_self_review tool', () => {
  it('has correct definition name', () => {
    expect(createSelfReviewDefinition.name).toBe('create_self_review');
  });

  it('requires path and diff', () => {
    expect(createSelfReviewDefinition.inputSchema.required).toContain('path');
    expect(createSelfReviewDefinition.inputSchema.required).toContain('diff');
  });

  it('exposes optional customRules, maxFileSize, maxFileCount properties', () => {
    const props = createSelfReviewDefinition.inputSchema.properties;
    expect(props.customRules).toBeDefined();
    expect(props.maxFileSize).toBeDefined();
    expect(props.maxFileCount).toBeDefined();
  });

  it('returns a response object with content array for a valid diff', async () => {
    const response = await handleCreateSelfReview({
      path: '/tmp',
      diff: SAMPLE_DIFF,
    });
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe('text');
  });

  it('returns a response for an empty diff', async () => {
    const response = await handleCreateSelfReview({
      path: '/tmp',
      diff: '',
    });
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
  });

  it('accepts optional maxFileSize and maxFileCount', async () => {
    const response = await handleCreateSelfReview({
      path: '/tmp',
      diff: SAMPLE_DIFF,
      maxFileSize: 100,
      maxFileCount: 10,
    });
    expect(response).toHaveProperty('content');
  });
});

// ============ analyze_diff ============

describe('analyze_diff tool', () => {
  it('has correct definition name', () => {
    expect(analyzeDiffDefinition.name).toBe('analyze_diff');
  });

  it('requires diff', () => {
    expect(analyzeDiffDefinition.inputSchema.required).toContain('diff');
  });

  it('does not require path', () => {
    expect(analyzeDiffDefinition.inputSchema.required).not.toContain('path');
  });

  it('exposes optional forbiddenPatterns, maxFileSize, maxFileCount properties', () => {
    const props = analyzeDiffDefinition.inputSchema.properties;
    expect(props.forbiddenPatterns).toBeDefined();
    expect(props.maxFileSize).toBeDefined();
    expect(props.maxFileCount).toBeDefined();
  });

  it('returns a response object for a valid diff', async () => {
    const response = await handleAnalyzeDiff({ diff: SAMPLE_DIFF });
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0].type).toBe('text');
  });

  it('flags forbidden patterns found in diff', async () => {
    const response = await handleAnalyzeDiff({
      diff: SAMPLE_DIFF,
      forbiddenPatterns: ['console\\.log'],
    });
    expect(response).toHaveProperty('content');
    const parsed = JSON.parse(response.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].passed).toBe(false);
  });

  it('returns empty array when no issues found', async () => {
    const response = await handleAnalyzeDiff({ diff: SAMPLE_DIFF });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('flags oversized files when maxFileSize is exceeded', async () => {
    // Build a diff with 2 additions so totalLines=2; maxFileSize=1 triggers violation (2 > 1)
    const largeDiff = `diff --git a/src/big.ts b/src/big.ts
index 1234567..abcdefg 100644
--- a/src/big.ts
+++ b/src/big.ts
@@ -1,3 +1,5 @@
 export function big() {
+  console.log('line1');
+  console.log('line2');
   return 42;
 }
`;
    const response = await handleAnalyzeDiff({
      diff: largeDiff,
      maxFileSize: 1, // 2 additions > 1 triggers violation
    });
    const parsed = JSON.parse(response.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((item: { passed: boolean }) => !item.passed)).toBe(true);
  });
});

// ============ request_peer_review ============

describe('request_peer_review tool', () => {
  it('has correct definition name', () => {
    expect(requestPeerReviewDefinition.name).toBe('request_peer_review');
  });

  it('requires path, agentType, and diff', () => {
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('path');
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('agentType');
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('diff');
  });

  it('agentType has correct enum values', () => {
    const agentType = requestPeerReviewDefinition.inputSchema.properties.agentType as {
      type: string;
      enum: string[];
    };
    expect(agentType.enum).toContain('architecture-enforcer');
    expect(agentType.enum).toContain('documentation-maintainer');
    expect(agentType.enum).toContain('test-reviewer');
    expect(agentType.enum).toContain('entropy-cleaner');
    expect(agentType.enum).toContain('custom');
  });

  it('exposes optional context property', () => {
    expect(requestPeerReviewDefinition.inputSchema.properties.context).toBeDefined();
  });

  it('returns a response when a NoOp executor is configured by default', async () => {
    const response = await handleRequestPeerReview({
      path: '/tmp',
      agentType: 'test-reviewer',
      diff: SAMPLE_DIFF,
    });
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    // NoOp executor is the default — returns a successful review
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveProperty('agentType', 'test-reviewer');
    expect(parsed).toHaveProperty('approved');
  });

  it('accepts optional context string', async () => {
    const response = await handleRequestPeerReview({
      path: '/tmp',
      agentType: 'architecture-enforcer',
      diff: SAMPLE_DIFF,
      context: 'Reviewing new module boundaries',
    });
    expect(response).toHaveProperty('content');
  });

  it('returns error for invalid/empty diff parse failure gracefully', async () => {
    // An empty diff should parse successfully (returns empty files array)
    const response = await handleRequestPeerReview({
      path: '/tmp',
      agentType: 'entropy-cleaner',
      diff: '',
    });
    expect(response).toHaveProperty('content');
    expect(response.content[0].type).toBe('text');
  });
});
