import { describe, it, expect } from 'vitest';
import { searchSessionsDefinition, handleSearchSessions } from './search-sessions';
import { summarizeSessionDefinition } from './summarize-session';
import { insightsSummaryDefinition, handleInsightsSummary } from './insights-summary';
import { CORE_TOOL_NAMES, STANDARD_TOOL_NAMES } from '../tool-tiers';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Hermes Phase 1 MCP tool definitions', () => {
  it('search_sessions definition has the expected shape', () => {
    expect(searchSessionsDefinition.name).toBe('search_sessions');
    expect(searchSessionsDefinition.inputSchema.required).toEqual(['path', 'query']);
    expect(searchSessionsDefinition.inputSchema.properties).toHaveProperty('query');
    expect(searchSessionsDefinition.inputSchema.properties).toHaveProperty('archivedOnly');
    expect(searchSessionsDefinition.inputSchema.properties).toHaveProperty('fileKinds');
  });

  it('summarize_session definition has the expected shape', () => {
    expect(summarizeSessionDefinition.name).toBe('summarize_session');
    expect(summarizeSessionDefinition.inputSchema.required).toEqual(['path', 'sessionId']);
    expect(summarizeSessionDefinition.inputSchema.properties).toHaveProperty('force');
  });

  it('insights_summary definition has the expected shape', () => {
    expect(insightsSummaryDefinition.name).toBe('insights_summary');
    expect(insightsSummaryDefinition.inputSchema.required).toEqual(['path']);
    expect(insightsSummaryDefinition.inputSchema.properties).toHaveProperty('skip');
  });
});

describe('Hermes Phase 1 tier assignments', () => {
  it('search_sessions is in core', () => {
    expect(CORE_TOOL_NAMES).toContain('search_sessions');
  });

  it('insights_summary is in core', () => {
    expect(CORE_TOOL_NAMES).toContain('insights_summary');
  });

  it('summarize_session is in standard but not core', () => {
    expect(CORE_TOOL_NAMES).not.toContain('summarize_session');
    expect(STANDARD_TOOL_NAMES).toContain('summarize_session');
  });
});

describe('handleSearchSessions integration', () => {
  it('returns isError=true when query is empty', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hermes-cli-mcp-'));
    try {
      const res = await handleSearchSessions({ path: tmp, query: '' });
      expect(res.isError).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns Ok with empty matches when index is empty', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hermes-cli-mcp-'));
    try {
      const res = await handleSearchSessions({ path: tmp, query: 'nothing' });
      expect(res.isError).toBeUndefined();
      const parsed = JSON.parse(res.content[0]!.text) as {
        matches: unknown[];
        totalIndexed: number;
      };
      expect(parsed.matches).toEqual([]);
      expect(parsed.totalIndexed).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('handleInsightsSummary integration', () => {
  it('returns a composite report with all top-level keys', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hermes-cli-mcp-insights-'));
    try {
      const res = await handleInsightsSummary({ path: tmp });
      expect(res.isError).toBeUndefined();
      const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
      expect(parsed).toHaveProperty('health');
      expect(parsed).toHaveProperty('entropy');
      expect(parsed).toHaveProperty('decay');
      expect(parsed).toHaveProperty('attention');
      expect(parsed).toHaveProperty('impact');
      expect(parsed).toHaveProperty('warnings');
      expect(parsed).toHaveProperty('generatedAt');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('honours --skip / skip parameter', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hermes-cli-mcp-insights-skip-'));
    try {
      const res = await handleInsightsSummary({ path: tmp, skip: ['entropy', 'health'] });
      expect(res.isError).toBeUndefined();
      const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown>;
      expect(parsed.entropy).toBeNull();
      expect(parsed.health).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
