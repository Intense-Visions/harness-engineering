import { describe, it, expect } from 'vitest';
import { runSecurityAgent, SECURITY_DESCRIPTOR } from '../../../src/review/agents/security-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'security',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/api/auth.ts',
        content: 'export function login(user: string, pass: string) { return true; }',
        reason: 'changed',
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('SECURITY_DESCRIPTOR', () => {
  it('has domain security and tier strong', () => {
    expect(SECURITY_DESCRIPTOR.domain).toBe('security');
    expect(SECURITY_DESCRIPTOR.tier).toBe('strong');
  });

  it('has a displayName', () => {
    expect(SECURITY_DESCRIPTOR.displayName).toBe('Security');
  });
});

describe('runSecurityAgent()', () => {
  it('returns ReviewFinding[] with domain security', () => {
    const findings = runSecurityAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('security');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runSecurityAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects eval usage', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/eval-usage.ts',
          content: 'const result = eval(userInput);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('eval'))).toBe(true);
    expect(findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('detects hardcoded secrets', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-1234567890abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('secret') || f.title.toLowerCase().includes('hardcoded')
      )
    ).toBe(true);
  });

  it('detects SQL injection risk from string concatenation', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db.ts',
          content: 'const query = "SELECT * FROM users WHERE id = " + userId;',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(true);
  });

  it('does not flag prose SQL keywords (whole-word) in a log template as SQL injection', () => {
    // `updated`/`created` etc. contain UPDATE/CREATE as substrings but are not SQL.
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/update.ts',
          content:
            'logger.warn(`Found ${installs.length} installs. Only the active one was updated.`);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  it('does not scan non-code files (a Markdown doc) for SQL injection', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'docs/guides/features-overview.md',
          content: '| `harness skill search` | Search and get updated results from the registry |',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  // Regression for #657: a bare SQL keyword followed by `+ <word>` in prose
  // (arithmetic-style, e.g. a markdown heading rendered into a code comment or a
  // plain string) must NOT flag CWE-89. The keyword has to live inside a quoted
  // string literal that is actually concatenated for the heuristic to fire.
  it('does not flag a prose heading with a SQL keyword and a `+` (issue #657 acceptance)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/phases.ts',
          content: '// ### Sub-Phase 3: UPDATE (medium + large tiers)',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const sqlCritical = findings.filter(
      (f) => f.title.toLowerCase().includes('sql') && f.severity === 'critical'
    );
    expect(sqlCritical).toHaveLength(0);
  });

  it('does not flag a plain string holding a prose SQL keyword with a `+` (issue #657)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/labels.ts',
          content: 'const label = "UPDATE (medium + large tiers)";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  it('still flags genuine SQL built by concatenating a query string with input (issue #657)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db.ts',
          content: 'const rows = db.query("SELECT * FROM users WHERE id = " + userId);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const sql = findings.filter((f) => f.title.toLowerCase().includes('sql'));
    expect(sql.length).toBeGreaterThanOrEqual(1);
    expect(sql[0]!.cweId).toBe('CWE-89');
    expect(sql[0]!.severity).toBe('critical');
  });

  // A SQL keyword used as an ordinary English word inside a concatenated string
  // literal is not SQL. The match is case-insensitive, so "create"/"update"/
  // "select"/"delete" in prose whole-word-matched the keyword list; the #657
  // string-boundary fix did not cover it. A real query pairs the keyword with a
  // structural companion (FROM/INTO/WHERE/SET/VALUES/TABLE/JOIN) — prose does not.
  it('does not flag a commander help string that uses "create" as prose', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/commands/roadmap/sync.ts',
          // Verbatim: this exact line was reported as a critical CWE-89
          // SQL-injection finding and hard-blocked a PR.
          content:
            "'never create a ticket for a row lacking an externalId (report the skip instead) — ' +",
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  it.each([
    ["'the operator must select a milestone before continuing, ' +", 'select'],
    ["'this will delete every row that is no longer referenced, ' +", 'delete'],
    ["'we update the label only when the status actually moved, ' +", 'update'],
    ["'drop the stale entry and continue, ' +", 'drop'],
  ])('does not flag prose using %s as an English word', (content) => {
    const bundle = makeBundle({
      changedFiles: [{ path: 'src/prose.ts', content, reason: 'changed', lines: 1 }],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  it('does not flag a template literal whose prose uses a SQL keyword as a word', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/log.ts',
          content: 'logger.info(`Would create ${planned.length} ticket(s) for this run.`);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(false);
  });

  // NOTE: inputs deliberately avoid embedding the opposite quote character.
  // The `[^"']` character class cannot span a nested quote, so
  // `"INSERT INTO t VALUES ('" + name + "')"` is missed — a PRE-EXISTING
  // limitation of this heuristic (verified against the pattern before the
  // companion-token change), not a regression from it.
  it.each([
    ['const q = "INSERT INTO audit (actor) VALUES (" + actorId + ")";', 'INSERT INTO'],
    ['const q = "UPDATE users SET active = " + flag;', 'UPDATE SET'],
    ['const q = "DELETE FROM sessions WHERE id = " + id;', 'DELETE FROM'],
    ['const q = `SELECT * FROM t JOIN u ON u.id = t.id WHERE t.k = ${k}`;', 'SELECT JOIN'],
  ])('still flags genuine SQL: %s', (content) => {
    const bundle = makeBundle({
      changedFiles: [{ path: 'src/db3.ts', content, reason: 'changed', lines: 1 }],
    });
    const findings = runSecurityAgent(bundle);
    const sql = findings.filter((f) => f.title.toLowerCase().includes('sql'));
    expect(sql.length).toBeGreaterThanOrEqual(1);
    expect(sql[0]!.cweId).toBe('CWE-89');
  });

  it('still flags a template literal query with interpolation (issue #657)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db2.ts',
          content: 'const rows = db.query(`SELECT * FROM users WHERE id = ${userId}`);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(true);
  });

  it('detects shell command injection risk', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/exec.ts',
          content: 'import { exec } from "child_process";\nexec(`rm -rf ${userDir}`);',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('command') ||
          f.title.toLowerCase().includes('injection') ||
          f.title.toLowerCase().includes('exec')
      )
    ).toBe(true);
  });

  it('generates unique ids', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/multi.ts',
          content: 'eval(x);\nconst key = "secret123";',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('populates cweId and owaspCategory on eval usage findings', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/eval-usage.ts',
          content: 'const result = eval(userInput);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    const f = findings[0]!;
    expect(f.cweId).toBe('CWE-94');
    expect(f.owaspCategory).toBe('A03:2021 Injection');
    expect(f.confidence).toBe('high');
    expect(f.remediation).toBeDefined();
    expect(f.references).toBeDefined();
    expect(f.references!.length).toBeGreaterThan(0);
  });

  it('populates cweId and owaspCategory on hardcoded secret findings', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-1234567890abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    const f = findings[0]!;
    expect(f.cweId).toBe('CWE-798');
    expect(f.owaspCategory).toBe('A07:2021 Identification and Authentication Failures');
    expect(f.confidence).toBe('high');
  });

  it('populates cweId on SQL injection findings', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db.ts',
          content: 'const query = "SELECT * FROM users WHERE id = " + userId;',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.cweId).toBe('CWE-89');
    expect(findings[0]!.owaspCategory).toBe('A03:2021 Injection');
  });

  it('populates cweId on command injection findings', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/exec.ts',
          content: 'import { exec } from "child_process";\nexec(`rm -rf ${userDir}`);',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const cmdFindings = findings.filter((f) => f.cweId === 'CWE-78');
    expect(cmdFindings.length).toBeGreaterThan(0);
    expect(cmdFindings[0]!.owaspCategory).toBe('A03:2021 Injection');
  });

  it('non-security fields are unaffected by security field additions', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/safe.ts',
          content: 'export function add(a: number, b: number): number { return a + b; }',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(0);
  });

  it('returns empty findings for safe code', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/safe.ts',
          content: 'export function add(a: number, b: number): number { return a + b; }',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(0);
  });
});
