import { describe, it, expect } from 'vitest';
import {
  checkDocsDefinition,
  handleCheckDocs,
  validateKnowledgeMapDefinition,
  handleValidateKnowledgeMap,
} from '../../src/tools/docs';

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
});

describe('validate_knowledge_map tool', () => {
  it('has correct definition', () => {
    expect(validateKnowledgeMapDefinition.name).toBe('validate_knowledge_map');
    expect(validateKnowledgeMapDefinition.inputSchema.required).toContain('path');
  });

  it('has path property', () => {
    expect(validateKnowledgeMapDefinition.inputSchema.properties).toHaveProperty('path');
  });

  it('returns error response for nonexistent path', async () => {
    const response = await handleValidateKnowledgeMap({ path: '/nonexistent/project' });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('Failed to read AGENTS.md');
  });
});
