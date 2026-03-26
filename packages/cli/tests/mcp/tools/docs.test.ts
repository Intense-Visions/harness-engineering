import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkDocsDefinition, handleCheckDocs } from '../../../src/mcp/tools/docs';

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

describe('check_docs respects docsDir config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-docs-test-'));
    // Create project with custom docsDir
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './doc',
      })
    );
    fs.mkdirSync(path.join(tmpDir, 'doc'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'doc', 'api.md'), '# API Docs\n');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses docsDir from harness.config.json instead of hardcoded docs/', async () => {
    // Put a doc with a link to index.ts in the custom ./doc dir (NOT in ./docs)
    fs.writeFileSync(
      path.join(tmpDir, 'doc', 'index.md'),
      '# Index module docs\n\nSee [index](../src/index.ts) for exports.\n'
    );
    // Ensure ./docs does NOT exist — if the code hardcodes 'docs', it won't find docs
    expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(false);

    const response = await handleCheckDocs({ path: tmpDir });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    // With the fix, docsDir resolves to ./doc and finds index.md → documented
    // Without the fix, docsDir resolves to ./docs (doesn't exist) → 0 documented
    expect(parsed.documented).toContain('index.ts');
  });
});
