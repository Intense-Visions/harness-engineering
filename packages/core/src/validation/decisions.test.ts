import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateDecisionNumbers } from './decisions';

function adr(number: string, title: string): string {
  return `---
number: ${number}
title: ${title}
date: 2026-04-27
status: accepted
tier: large
---

## Context

Body for ${title}.
`;
}

async function makeProject(decisions: Record<string, string>, baseline?: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adr-numbers-'));
  const dDir = path.join(dir, 'docs', 'knowledge', 'decisions');
  await fs.mkdir(dDir, { recursive: true });
  for (const [name, content] of Object.entries(decisions)) {
    await fs.writeFile(path.join(dDir, name), content);
  }
  if (baseline !== undefined) {
    const bDir = path.join(dir, '.harness', 'decisions');
    await fs.mkdir(bDir, { recursive: true });
    await fs.writeFile(path.join(bDir, 'number-baseline.json'), JSON.stringify(baseline, null, 2));
  }
  return dir;
}

describe('validateDecisionNumbers', () => {
  it('returns ok when the decisions corpus is absent (not applicable)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adr-empty-'));
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.filesChecked).toBe(0);
      expect(r.value.collisions).toEqual([]);
    }
  });

  it('passes a clean corpus with all-distinct numbers', async () => {
    const dir = await makeProject({
      '0001-alpha.md': adr('0001', 'Alpha'),
      '0002-beta.md': adr('0002', 'Beta'),
      '0003-gamma.md': adr('0003', 'Gamma'),
    });
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.filesChecked).toBe(3);
      expect(r.value.collisions).toEqual([]);
      expect(r.value.newCollisions).toEqual([]);
    }
  });

  it('FLAGS a corpus containing duplicate number: values (no baseline)', async () => {
    const dir = await makeProject({
      '0001-alpha.md': adr('0001', 'Alpha'),
      '0039-self-audit.md': adr('0039', 'Self audit'),
      '0039-adapter.md': adr('0039', 'Adapter'),
    });
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('0039');
      const detail = r.error.details as {
        validation: { newCollisions: Array<{ number: string; files: string[] }> };
      };
      expect(detail.validation.newCollisions).toHaveLength(1);
      const collision = detail.validation.newCollisions[0];
      expect(collision?.number).toBe('0039');
      expect(collision?.files).toEqual(['0039-adapter.md', '0039-self-audit.md']);
    }
  });

  it('preserves zero-padded identity (does not YAML-octal-collapse 0011)', async () => {
    // Under YAML 1.1 the unquoted values 0011 and 0009 would both be octal;
    // 0011 → 9 would spuriously collide with a real 0009. The check reads the
    // raw value, so these stay distinct.
    const dir = await makeProject({
      '0009-nine.md': adr('0009', 'Nine'),
      '0011-eleven.md': adr('0011', 'Eleven'),
    });
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.collisions).toEqual([]);
  });

  it('grandfathers a baselined collision but still FLAGS a new one', async () => {
    const dir = await makeProject(
      {
        '0039-self-audit.md': adr('0039', 'Self audit'),
        '0039-adapter.md': adr('0039', 'Adapter'),
        '0050-report.md': adr('0050', 'Report'),
        '0050-invariant.md': adr('0050', 'Invariant'),
      },
      {
        version: 1,
        grandfathered: [{ number: '0039', files: ['0039-adapter.md', '0039-self-audit.md'] }],
      }
    );
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const detail = r.error.details as {
        validation: {
          grandfathered: Array<{ number: string }>;
          newCollisions: Array<{ number: string }>;
        };
      };
      expect(detail.validation.grandfathered.map((c) => c.number)).toEqual(['0039']);
      expect(detail.validation.newCollisions.map((c) => c.number)).toEqual(['0050']);
    }
  });

  it('passes when every collision is grandfathered', async () => {
    const dir = await makeProject(
      {
        '0039-self-audit.md': adr('0039', 'Self audit'),
        '0039-adapter.md': adr('0039', 'Adapter'),
      },
      {
        version: 1,
        grandfathered: [{ number: '0039', files: ['0039-adapter.md', '0039-self-audit.md'] }],
      }
    );
    const r = await validateDecisionNumbers(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.grandfathered.map((c) => c.number)).toEqual(['0039']);
      expect(r.value.newCollisions).toEqual([]);
    }
  });

  it('FLAGS a new file joining an otherwise-grandfathered collision', async () => {
    const dir = await makeProject(
      {
        '0039-self-audit.md': adr('0039', 'Self audit'),
        '0039-adapter.md': adr('0039', 'Adapter'),
        '0039-newcomer.md': adr('0039', 'Newcomer'),
      },
      {
        version: 1,
        grandfathered: [{ number: '0039', files: ['0039-adapter.md', '0039-self-audit.md'] }],
      }
    );
    const r = await validateDecisionNumbers(dir);
    // The baselined file-set no longer matches (a third file joined), so the
    // collision is treated as new — grandfathering is keyed on the exact set.
    expect(r.ok).toBe(false);
  });
});
