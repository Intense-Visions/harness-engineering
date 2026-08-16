import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  gatherSignoffBasis,
  readExistingSignoff,
  renderSignoffMarkdown,
} from '../../../src/server/gather/signoff';

async function makeChange(root: string, slug: string, proposal: string | null): Promise<void> {
  await mkdir(join(root, 'docs', 'changes', slug), { recursive: true });
  if (proposal !== null) {
    await writeFile(join(root, 'docs', 'changes', slug, 'proposal.md'), proposal, 'utf-8');
  }
}

describe('gatherSignoffBasis — acceptance basis extraction (#710)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'signoff-gather-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // AC-2 — Success Criteria basis
  it('extracts each Success Criterion as {id,text} with basisSection "Success Criteria"', async () => {
    await makeChange(
      root,
      'acme',
      [
        '# Proposal',
        '',
        '## Success Criteria',
        '',
        '1. **First thing works.** Detail here. _Covering check:_ a test.',
        '2. **Second thing works.** More detail.',
        '',
        '## Implementation Order',
        '1. Do it.',
      ].join('\n')
    );

    const basis = await gatherSignoffBasis(root, 'acme');
    expect(basis.basisSection).toBe('Success Criteria');
    expect(basis.items).toEqual([
      { id: 'SC1', text: 'First thing works. Detail here.' },
      { id: 'SC2', text: 'Second thing works. More detail.' },
    ]);
    expect(basis.existing).toBeUndefined();
  });

  // AC-3 — soft-degrade to User-Visible Behavior
  it('falls back to User-Visible Behavior when no Success Criteria section exists', async () => {
    await makeChange(
      root,
      'thin',
      ['# Proposal', '', '## User-Visible Behavior', '', '- The button appears.'].join('\n')
    );
    const basis = await gatherSignoffBasis(root, 'thin');
    expect(basis.basisSection).toBe('User-Visible Behavior');
    expect(basis.items).toEqual([{ id: 'SC1', text: 'The button appears.' }]);
  });

  // AC-3 — soft-degrade to Overview
  it('falls back to Overview when neither Success Criteria nor User-Visible Behavior exist', async () => {
    await makeChange(
      root,
      'over',
      ['# Proposal', '', '## Overview', '', '- Ships a thing.'].join('\n')
    );
    const basis = await gatherSignoffBasis(root, 'over');
    expect(basis.basisSection).toBe('Overview');
    expect(basis.items).toEqual([{ id: 'SC1', text: 'Ships a thing.' }]);
  });

  // AC-3 — no proposal on disk
  it('returns items:[] and basisSection:null when there is no proposal (never throws)', async () => {
    await makeChange(root, 'empty', null);
    const basis = await gatherSignoffBasis(root, 'empty');
    expect(basis.items).toEqual([]);
    expect(basis.basisSection).toBeNull();
  });

  // AC-3 — proposal with no recognized basis section
  it('returns basisSection:null when the proposal has no recognized basis section', async () => {
    await makeChange(root, 'nobasis', '# Proposal\n\n## Random Section\n\n- Nope.');
    const basis = await gatherSignoffBasis(root, 'nobasis');
    expect(basis.items).toEqual([]);
    expect(basis.basisSection).toBeNull();
  });

  // AC-8 — existing sign-off surfaced
  it('surfaces a prior signoff.md as `existing`', async () => {
    await makeChange(root, 'signed', '# Proposal\n\n## Success Criteria\n\n1. **Works.**');
    const md = renderSignoffMarkdown({
      slug: 'signed',
      decision: 'ACCEPTED',
      signedOffBy: 'Dana',
      signedAt: '2026-08-16T00:00:00.000Z',
      items: [{ id: 'SC1', disposition: 'ACCEPT', note: 'good' }],
    });
    await writeFile(join(root, 'docs', 'changes', 'signed', 'signoff.md'), md, 'utf-8');

    const basis = await gatherSignoffBasis(root, 'signed');
    expect(basis.existing).toBeDefined();
    expect(basis.existing?.decision).toBe('ACCEPTED');
    expect(basis.existing?.signedOffBy).toBe('Dana');
    expect(basis.existing?.items).toContainEqual({
      id: 'SC1',
      disposition: 'ACCEPT',
      note: 'good',
    });
  });
});

describe('renderSignoffMarkdown — signoff.md template (#710 AC-5)', () => {
  it('renders overall decision, signer, timestamp, and accepted/rejected split', () => {
    const md = renderSignoffMarkdown({
      slug: 'acme',
      decision: 'CHANGES_REQUESTED',
      signedOffBy: 'Dana Okoro',
      signedAt: '2026-08-16T12:00:00.000Z',
      items: [
        { id: 'SC1', disposition: 'ACCEPT' },
        { id: 'SC2', disposition: 'REJECT', note: 'cadence wrong' },
      ],
    });
    expect(md).toContain('- **Overall decision:** CHANGES_REQUESTED');
    expect(md).toContain('- **Signed off by:** Dana Okoro');
    expect(md).toContain('- **Date:** 2026-08-16T12:00:00.000Z');
    expect(md).toContain('## Accepted');
    expect(md).toContain('**SC1**');
    expect(md).toContain('## Rejected / changes-requested');
    expect(md).toContain('**SC2**');
    expect(md).toContain('cadence wrong');
  });

  it('round-trips through readExistingSignoff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'signoff-roundtrip-'));
    try {
      await mkdir(join(root, 'docs', 'changes', 'rt'), { recursive: true });
      const md = renderSignoffMarkdown({
        slug: 'rt',
        decision: 'REJECTED',
        signedOffBy: 'Sam',
        signedAt: '2026-08-16T09:00:00.000Z',
        items: [{ id: 'SC1', disposition: 'REJECT', note: 'no' }],
      });
      await writeFile(join(root, 'docs', 'changes', 'rt', 'signoff.md'), md, 'utf-8');
      const rec = await readExistingSignoff(root, 'rt');
      expect(rec?.decision).toBe('REJECTED');
      expect(rec?.signedOffBy).toBe('Sam');
      expect(rec?.items).toContainEqual({ id: 'SC1', disposition: 'REJECT', note: 'no' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
