import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleGatherContext } from '../../../src/mcp/tools/gather-context';

function parse(r: { content: Array<{ text: string }> }) {
  return JSON.parse(r.content[0].text);
}

describe('gather_context branch coverage (cov544)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-cov-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sanitizePath throw (root) → isError', async () => {
    const r = await handleGatherContext({ path: '/', intent: 'do a thing' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('filesystem root');
  });

  it('section=graphContext with summary mode → guard isError', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      section: 'graphContext',
      mode: 'summary',
    });
    expect(r.isError).toBe(true);
    const parsed = parse(r);
    expect(parsed.error).toContain('mode=detailed');
    expect(parsed.hint).toContain('mode="detailed"');
  });

  it('section=graphContext with detailed mode → paginated section shape', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      section: 'graphContext',
      mode: 'detailed',
      include: ['graph'],
    });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed.section).toBe('graphContext');
    expect(parsed).toHaveProperty('items');
    expect(parsed).toHaveProperty('pagination');
    expect(parsed).toHaveProperty('totalTokenEstimate');
  });

  it('section=learnings → paginated section shape with defaults', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      section: 'learnings',
      include: ['learnings'],
    });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed.section).toBe('learnings');
    expect(parsed.pagination.offset).toBe(0);
    expect(parsed.pagination.limit).toBe(20);
  });

  it('section=sessionSections → paginated section shape', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      section: 'sessionSections',
      offset: 5,
      limit: 3,
    });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed.section).toBe('sessionSections');
    expect(parsed.pagination.offset).toBe(5);
    expect(parsed.pagination.limit).toBe(3);
  });

  it('no section, summary mode, default includes → full assembled response', async () => {
    const r = await handleGatherContext({ path: dir, intent: 'implement feature' });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed).toHaveProperty('state');
    expect(parsed).toHaveProperty('learnings');
    expect(parsed).toHaveProperty('comprehension');
    expect(parsed).toHaveProperty('graphContext');
    expect(parsed.meta).toHaveProperty('assembledIn');
    expect(parsed.meta).toHaveProperty('tokenEstimate');
    expect(parsed.meta.graphAvailable).toBe(false);
  });

  it('detailed mode with explicit narrow include set', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      include: ['state'],
      mode: 'detailed',
    });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    // learnings not requested → defaults to []
    expect(parsed.learnings).toEqual([]);
    // graph not requested → null → summary/detailed both null
    expect(parsed.graphContext).toBeNull();
  });

  it('includeEvents=false explicitly disables the events timeline', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      include: ['state'],
      includeEvents: false,
    });
    const parsed = parse(r);
    expect(parsed.events).toBeNull();
  });

  it('include=[events] forces the events timeline branch', async () => {
    const r = await handleGatherContext({ path: dir, intent: 'x', include: ['events'] });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed).toHaveProperty('events');
  });

  it('runs many constituents (validation/sessions/handoff/businessKnowledge) recording errors', async () => {
    const r = await handleGatherContext({
      path: dir,
      intent: 'x',
      include: ['validation', 'sessions', 'handoff', 'businessKnowledge'],
      session: 'sess-x',
      mode: 'detailed',
    });
    expect(r.isError).toBeFalsy();
    const parsed = parse(r);
    expect(parsed.meta).toHaveProperty('errors');
    expect(Array.isArray(parsed.meta.errors)).toBe(true);
  });

  it('session provided with no include array → events default on', async () => {
    fs.mkdirSync(path.join(dir, '.harness'), { recursive: true });
    const r = await handleGatherContext({ path: dir, intent: 'x', session: 'sess-y' });
    expect(r.isError).toBeFalsy();
  });

  it('session-scoped gather updates index best-effort without failing', async () => {
    fs.mkdirSync(path.join(dir, '.harness'), { recursive: true });
    const r = await handleGatherContext({
      path: dir,
      intent: 'session work',
      session: 'sess-1',
      skill: 'harness-execution',
      include: ['state'],
    });
    expect(r.isError).toBeFalsy();
  });
});
