import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  FindingsView,
  parseFindingsResult,
} from '../../../../src/client/components/chat/FindingsView';

const sampleSecurityScan = {
  findings: [
    {
      ruleId: 'SEC-INJ-001',
      ruleName: 'SQL injection via string concat',
      category: 'injection',
      severity: 'error',
      file: 'src/db/users.ts',
      line: 42,
      match: 'db.query(`SELECT * FROM users WHERE id = ${id}`)',
    },
    {
      ruleId: 'SEC-WEAK-001',
      ruleName: 'Weak hashing algorithm',
      category: 'crypto',
      severity: 'warning',
      file: 'src/auth/legacy.ts',
      line: 8,
    },
    {
      ruleId: 'INFO-FIX-AVAIL',
      ruleName: 'Auto-fix available for 3 issues',
      severity: 'info',
    },
  ],
  summary: { errors: 1, warnings: 1, info: 1 },
};

describe('parseFindingsResult', () => {
  it('parses a security-scan-style payload', () => {
    const result = parseFindingsResult(JSON.stringify(sampleSecurityScan));
    expect(result?.findings).toHaveLength(3);
    expect(result?.findings[0]?.severity).toBe('error');
  });

  it('strips a leading <!-- packed: ... --> envelope comment', () => {
    const raw = `<!-- packed: structural | 200→100 tokens -->\n${JSON.stringify(sampleSecurityScan)}`;
    expect(parseFindingsResult(raw)?.findings).toHaveLength(3);
  });

  it('normalizes severity aliases (high → error, warn → warning)', () => {
    const payload = {
      findings: [
        { severity: 'high', ruleName: 'A' },
        { severity: 'warn', ruleName: 'B' },
      ],
    };
    const parsed = parseFindingsResult(JSON.stringify(payload));
    expect(parsed?.findings[0]?.severity).toBe('error');
    expect(parsed?.findings[1]?.severity).toBe('warning');
  });

  it('returns null when no findings array is present', () => {
    expect(parseFindingsResult(JSON.stringify({ result: 'ok' }))).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    expect(parseFindingsResult('Just prose.')).toBeNull();
  });
});

describe('FindingsView', () => {
  it('renders severity counts and finding rows', () => {
    const parsed = parseFindingsResult(JSON.stringify(sampleSecurityScan))!;
    render(<FindingsView payload={parsed} />);

    expect(screen.getByText(/1 error/)).toBeDefined();
    expect(screen.getByText(/1 warning/)).toBeDefined();
    expect(screen.getByText('SQL injection via string concat')).toBeDefined();
    expect(screen.getByText('src/db/users.ts:42')).toBeDefined();
  });

  it('expands a finding to show match/context on click', () => {
    const parsed = parseFindingsResult(JSON.stringify(sampleSecurityScan))!;
    render(<FindingsView payload={parsed} />);

    const titleRow = screen.getByText('SQL injection via string concat').closest('div')!
      .parentElement!.parentElement!;
    fireEvent.click(titleRow);

    expect(screen.getByText('db.query(`SELECT * FROM users WHERE id = ${id}`)')).toBeDefined();
  });

  it('sorts errors before warnings before info', () => {
    const out = [...sampleSecurityScan.findings].reverse();
    const parsed = parseFindingsResult(JSON.stringify({ findings: out }))!;
    const { container } = render(<FindingsView payload={parsed} />);
    const rows = container.querySelectorAll('[class*="rounded border border-neutral-border"]');
    // First rendered finding row should be the error
    expect(rows[0]?.textContent).toContain('SQL injection');
  });
});
