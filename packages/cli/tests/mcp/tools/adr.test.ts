import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { manageAdrDefinition, handleManageAdr } from '../../../src/mcp/tools/adr';
import { allocateNextNumber, listAdrs } from '../../../src/mcp/tools/adr-store';

let tmpDir: string;
let decisionsDir: string;

function writeAdr(number: string, slug: string, extra: string = ''): void {
  const content = `---
number: ${number}
title: Decision ${number}
date: 2026-01-01
status: accepted
tier: small
source: docs/changes/x/proposal.md
---

## Context

Some context for ${number}.

## Decision

We decided ${number}.

## Consequences

Consequences of ${number}.${extra}
`;
  fs.writeFileSync(path.join(decisionsDir, `${number}-${slug}.md`), content, 'utf-8');
}

/** Parse the JSON payload out of a (non-error) MCP text response. */
function payload(resp: Awaited<ReturnType<typeof handleManageAdr>>): any {
  const text = resp.content[0]!.text as string;
  return JSON.parse(text);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-test-'));
  decisionsDir = path.join(tmpDir, 'docs', 'knowledge', 'decisions');
  fs.mkdirSync(decisionsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('manage_adr tool definition', () => {
  it('is named manage_adr', () => {
    expect(manageAdrDefinition.name).toBe('manage_adr');
  });

  it('requires path and action', () => {
    expect(manageAdrDefinition.inputSchema.required).toContain('path');
    expect(manageAdrDefinition.inputSchema.required).toContain('action');
  });

  it('exposes create/read/update/list actions', () => {
    const actionProp = manageAdrDefinition.inputSchema.properties.action as { enum: string[] };
    expect(actionProp.enum).toEqual(['create', 'read', 'update', 'list']);
  });
});

describe('allocateNextNumber (#1323 collision safety)', () => {
  it('starts at 0001 in an empty directory', () => {
    expect(allocateNextNumber(tmpDir)).toBe('0001');
  });

  it('allocates max(existing)+1, not count+1, tolerating gaps and duplicates', () => {
    // Deliberately non-contiguous + a duplicate number, mirroring the real repo.
    writeAdr('0011', 'a');
    writeAdr('0011', 'b-dup'); // duplicate number (the #1323 defect)
    writeAdr('0050', 'c');
    writeAdr('0091', 'd');
    // count is 4, but max is 91 → a count-based scheme would collide at 0005/0092.
    expect(allocateNextNumber(tmpDir)).toBe('0092');
  });
});

describe('manage_adr create', () => {
  it('allocates a fresh number and writes a well-formed record', async () => {
    writeAdr('0091', 'existing');
    const resp = await handleManageAdr({
      path: tmpDir,
      action: 'create',
      title: 'ADR CRUD as an MCP tool',
      context: 'Callers cannot create ADRs programmatically.',
      decision: 'Expose manage_adr.',
      consequences: 'ADRs become first-class MCP records.',
    });
    expect(resp.isError).toBeFalsy();
    const record = payload(resp);
    expect(record.number).toBe('0092');
    expect(record.slug).toBe('adr-crud-as-an-mcp-tool');
    expect(record.status).toBe('proposed'); // default
    expect(record.file).toBe('0092-adr-crud-as-an-mcp-tool.md');

    const onDisk = fs.readFileSync(path.join(decisionsDir, record.file), 'utf-8');
    expect(onDisk).toContain('number: 0092');
    expect(onDisk).toContain('## Context');
    expect(onDisk).toContain('## Decision');
    expect(onDisk).toContain('## Consequences');
    expect(onDisk).toContain('Expose manage_adr.');
  });

  it('honors explicit status/tier/source and defaults the date', async () => {
    const resp = await handleManageAdr({
      path: tmpDir,
      action: 'create',
      title: 'Accepted Decision',
      status: 'accepted',
      tier: 'large',
      source: 'session:foo',
      context: 'c',
      decision: 'd',
      consequences: 'q',
    });
    const record = payload(resp);
    expect(record.status).toBe('accepted');
    expect(record.tier).toBe('large');
    expect(record.source).toBe('session:foo');
    expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects create without required sections', async () => {
    const resp = await handleManageAdr({
      path: tmpDir,
      action: 'create',
      title: 'Incomplete',
    });
    expect(resp.isError).toBe(true);
    expect(resp.content[0]!.text).toMatch(/context.*decision.*consequences|required/i);
  });

  it('two sequential creates never collide', async () => {
    await handleManageAdr({
      path: tmpDir,
      action: 'create',
      title: 'First',
      context: 'c',
      decision: 'd',
      consequences: 'q',
    });
    const second = payload(
      await handleManageAdr({
        path: tmpDir,
        action: 'create',
        title: 'Second',
        context: 'c',
        decision: 'd',
        consequences: 'q',
      })
    );
    expect(second.number).toBe('0002');
    expect(listAdrs(tmpDir).map((a) => a.number)).toEqual(['0001', '0002']);
  });
});

describe('manage_adr list', () => {
  it('returns every ADR as a number-sorted summary and skips the README', async () => {
    writeAdr('0002', 'second');
    writeAdr('0001', 'first');
    fs.writeFileSync(path.join(decisionsDir, 'README.md'), '# Not an ADR\n', 'utf-8');

    const resp = await handleManageAdr({ path: tmpDir, action: 'list' });
    const list = payload(resp);
    expect(list.map((a: { number: string }) => a.number)).toEqual(['0001', '0002']);
    expect(list.every((a: { body?: string }) => a.body === undefined)).toBe(true);
  });
});

describe('manage_adr read', () => {
  it('resolves by number, zero-padded number, and slug', async () => {
    writeAdr('0042', 'answer');

    for (const ref of ['42', '0042', 'answer', '0042-answer.md']) {
      const resp = await handleManageAdr({ path: tmpDir, action: 'read', ref });
      expect(resp.isError, `ref=${ref}`).toBeFalsy();
      const record = payload(resp);
      expect(record.number).toBe('0042');
      expect(record.body).toContain('## Decision');
    }
  });

  it('errors on an unknown ref', async () => {
    const resp = await handleManageAdr({ path: tmpDir, action: 'read', ref: '9999' });
    expect(resp.isError).toBe(true);
    expect(resp.content[0]!.text).toMatch(/not found/i);
  });
});

describe('manage_adr update', () => {
  it('patches frontmatter status without reusing the number', async () => {
    writeAdr('0007', 'lucky');
    const resp = await handleManageAdr({
      path: tmpDir,
      action: 'update',
      ref: '7',
      status: 'superseded',
      supersedes: '0003',
    });
    expect(resp.isError).toBeFalsy();
    const record = payload(resp);
    expect(record.number).toBe('0007'); // unchanged
    expect(record.status).toBe('superseded');
    expect(record.supersedes).toBe('0003');

    const onDisk = fs.readFileSync(path.join(decisionsDir, '0007-lucky.md'), 'utf-8');
    expect(onDisk).toContain('status: superseded');
    expect(onDisk).toContain('supersedes: 0003');
  });

  it('replaces a body section in place, leaving siblings intact', async () => {
    writeAdr('0008', 'sections');
    await handleManageAdr({
      path: tmpDir,
      action: 'update',
      ref: '0008',
      decision: 'A brand new decision.',
    });
    const record = payload(await handleManageAdr({ path: tmpDir, action: 'read', ref: '0008' }));
    expect(record.body).toContain('A brand new decision.');
    expect(record.body).not.toContain('We decided 0008.');
    // Sibling sections untouched.
    expect(record.body).toContain('Some context for 0008.');
    expect(record.body).toContain('Consequences of 0008.');
  });

  it('round-trips create → read → update → read', async () => {
    const created = payload(
      await handleManageAdr({
        path: tmpDir,
        action: 'create',
        title: 'Round Trip',
        context: 'original context',
        decision: 'original decision',
        consequences: 'original consequences',
      })
    );
    const readBack = payload(
      await handleManageAdr({ path: tmpDir, action: 'read', ref: created.number })
    );
    expect(readBack.body).toContain('original decision');

    await handleManageAdr({
      path: tmpDir,
      action: 'update',
      ref: created.number,
      status: 'accepted',
      context: 'revised context',
    });
    const updated = payload(
      await handleManageAdr({ path: tmpDir, action: 'read', ref: created.number })
    );
    expect(updated.status).toBe('accepted');
    expect(updated.body).toContain('revised context');
    expect(updated.body).toContain('original decision'); // untouched section
  });

  it('rejects a no-op update and mixing body with section edits', async () => {
    writeAdr('0009', 'noop');
    const noop = await handleManageAdr({ path: tmpDir, action: 'update', ref: '9' });
    expect(noop.isError).toBe(true);

    const conflict = await handleManageAdr({
      path: tmpDir,
      action: 'update',
      ref: '9',
      body: 'whole body',
      decision: 'section too',
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.content[0]!.text).toMatch(/either.*body.*or.*section/i);
  });
});
