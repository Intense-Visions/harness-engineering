import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBusinessKnowledgeResource } from '../../../src/mcp/resources/business-knowledge';

describe('getBusinessKnowledgeResource', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-resource-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty result when docs/knowledge/ does not exist', async () => {
    const result = JSON.parse(await getBusinessKnowledgeResource(tmpDir));
    expect(result).toEqual({ domains: {}, totalFiles: 0, totalDomains: 0 });
  });

  it('returns domain-organized knowledge entries', async () => {
    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge', 'architecture');
    await fs.mkdir(knowledgeDir, { recursive: true });
    await fs.writeFile(
      path.join(knowledgeDir, 'rules.md'),
      `---
type: business_rule
domain: architecture
tags: [layers]
---

# Layer Rules

Content here.
`,
      'utf-8'
    );

    const result = JSON.parse(await getBusinessKnowledgeResource(tmpDir));
    expect(result.totalFiles).toBe(1);
    expect(result.totalDomains).toBe(1);
    expect(result.domains.architecture).toHaveLength(1);
    expect(result.domains.architecture[0].type).toBe('business_rule');
    expect(result.domains.architecture[0].name).toBe('Layer Rules');
    expect(result.domains.architecture[0].tags).toEqual(['layers']);
  });

  it('skips files without valid frontmatter', async () => {
    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge', 'misc');
    await fs.mkdir(knowledgeDir, { recursive: true });
    await fs.writeFile(
      path.join(knowledgeDir, 'plain.md'),
      '# Just plain markdown\n\nNo frontmatter.',
      'utf-8'
    );

    const result = JSON.parse(await getBusinessKnowledgeResource(tmpDir));
    expect(result.totalFiles).toBe(0);
  });
});
