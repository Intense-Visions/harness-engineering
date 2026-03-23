import { describe, it, expect } from 'vitest';
import { checkDocsDefinition, handleCheckDocs } from '../../src/tools/docs';

describe('check_docs tool', () => {
  it('has correct definition', () => {
    expect(checkDocsDefinition.name).toBe('check_docs');
    expect(checkDocsDefinition.inputSchema.required).toContain('path');
  });

  it('has path and domain properties', () => {
    expect(checkDocsDefinition.inputSchema.properties).toHaveProperty('path');
    expect(checkDocsDefinition.inputSchema.properties).toHaveProperty('domain');
  });

  it('returns a response for nonexistent path', async () => {
    const response = await handleCheckDocs({ path: '/nonexistent/project' });
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });

  it('has scope property in definition', () => {
    expect(checkDocsDefinition.inputSchema.properties).toHaveProperty('scope');
    const scopeProp = checkDocsDefinition.inputSchema.properties.scope as { enum: string[] };
    expect(scopeProp.enum).toEqual(['coverage', 'integrity', 'all']);
  });

  it('defaults to coverage scope', async () => {
    const response = await handleCheckDocs({ path: '/nonexistent/project' });
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
    // Should not error (coverage mode tolerates missing dirs)
  });

  it('integrity scope returns error for nonexistent path', async () => {
    const response = await handleCheckDocs({ path: '/nonexistent/project', scope: 'integrity' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Failed to read AGENTS.md');
  });

  it('all scope runs both coverage and integrity', async () => {
    const response = await handleCheckDocs({ path: '/nonexistent/project', scope: 'all' });
    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0].text);
    // all scope returns an object with coverage and integrity keys
    expect(parsed).toHaveProperty('coverage');
    expect(parsed).toHaveProperty('integrity');
  });
});
