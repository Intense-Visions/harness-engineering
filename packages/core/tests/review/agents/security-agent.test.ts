import { describe, it, expect } from 'vitest';
import { runSecurityAgent, SECURITY_DESCRIPTOR } from '../../../src/review/agents/security-agent';
import { enforceFindingIntegrity } from '../../../src/review/finding-integrity';
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

  // ---- precision guards: test fixtures and comment bodies (issue #984) ----
  // The secrets detector deliberately keeps a WIDER file scope than the three
  // source-pattern detectors (a key in a .yml IS a leak), so it is guarded by
  // isTestFile + isCommentLine rather than isCodeFile. These lock that asymmetry.

  it('does not flag a fake key in a test fixture', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'packages/core/tests/review/agents/security-agent.test.ts',
          content: 'const API_KEY = "sk-live-0123456789abcdef0123456789abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('does not flag an example key documented in a JSDoc body', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: [
            '/**',
            ' * Set it like this:',
            ' * const API_KEY = "sk-live-0123456789abcdef0123456789abcdef";',
            ' */',
            'export const KEY = process.env.API_KEY;',
          ].join('\n'),
          reason: 'changed',
          lines: 5,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('STILL flags a real hardcoded key in source (guards must not over-suppress)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-live-0123456789abcdef0123456789abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe('critical');
  });

  // Non-code coverage is real but assignment-shaped: SECRET_PATTERNS key off
  // `<name> = "<value>"`, so a shell/env/dotenv form is caught while a YAML
  // `apiKey: "..."` is NOT (documented as a known gap in the PR, not fixed here).
  it('STILL flags a hardcoded key in a non-code file — secrets keep the wider scope', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'deploy/.env.example',
          content: 'API_KEY="sk-live-0123456789abcdef0123456789abcdef"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(1);
  });

  // ---- reference-vs-literal guard: a matched value that is a shell/env var
  // or a CI expression is resolved at runtime, not embedded in source, so it
  // must NOT be flagged as a hardcoded secret. This mis-fired on essentially
  // every PR touching a workflow file (e.g. GH_TOKEN="$AUTOAPPROVE_PAT"). ----

  it('does NOT flag a CI expression value in a workflow file', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: '.github/workflows/ci.yml',
          content: 'AUTOAPPROVE_PAT: "${{ secrets.BASELINE_AUTOAPPROVE_PAT }}"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('does NOT flag a shell variable reference assigned to a token', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: '.github/workflows/ci.yml',
          content: 'GH_TOKEN="$AUTOAPPROVE_PAT" gh pr review "$PR_URL" --approve',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('does NOT flag a ${VAR} brace reference assigned to a token', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'deploy/run.sh',
          content: 'export API_KEY="${DEPLOY_API_KEY}"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('STILL flags a genuine hardcoded literal (guard must not over-suppress)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-ant-api03-REALLOOKINGKEY0123456789abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(1);
    expect(findings[0]!.cweId).toBe('CWE-798');
  });

  it('STILL flags a literal with a variable-only PREFIX — a partial reference is not reference-only', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'deploy/run.sh',
          content: 'export API_KEY="${PREFIX}sk-live-0123456789abcdef"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(1);
  });

  // ---- command substitution: `$( ... )` / backticks produce the value at
  // runtime, so no secret literal is assigned in source and the finding must
  // not fire (issue-reported false positive: `GH_TOKEN="$(gh auth token)"`). ----

  it('does NOT flag a $() command-substitution value assigned to a token', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: '.github/workflows/ci.yml',
          content: 'GH_TOKEN="$(gh auth token)" gh pr create --title x',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('does NOT flag a backtick command-substitution value assigned to a token', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'deploy/run.sh',
          content: 'API_KEY="`vault read -field=token secret/ci`"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('STILL flags a command substitution mixed with a literal suffix (guard must not over-suppress)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'deploy/run.sh',
          content: 'export API_KEY="$(id -u)-sk-live-0123456789abcdef"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(1);
  });

  // ---- guards are code-scoped: test-markers and comment syntax are JS/TS
  // conventions, so they must not suppress findings in non-code files ----

  it('STILL flags a key in .env.test.local — test-file markers only apply to code files', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: '.env.test.local',
          content: 'API_KEY="sk-live-0123456789abcdef0123456789abcdef"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(1);
  });

  it('STILL flags a key in a Markdown `*` bullet — JS comment syntax only applies to code files', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'docs/runbook.md',
          content: '* API_KEY = "sk-live-0123456789abcdef0123456789abcdef"',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(1);
  });

  it('STILL flags a secret after a URL on the same line — protocol `//` is not a comment', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/client.ts',
          content: 'const url = "https://api.example.com"; const password = "hunter2hunter2";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(1);
    expect(findings[0]!.cweId).toBe('CWE-798');
  });

  // ---- comment skip is comment-ONLY lines: a comment prefix must not hide
  // executable code (issue #984 follow-up — the old prefix check let a
  // uniform `/**/ ` prefix silence all four detectors) ----

  it.each([
    ['/**/ eval(userInput);', 'block-comment prefix'],
    ['*/ eval(userInput);', 'code after a block-comment close'],
    ['/* istanbul ignore next */ eval(userInput);', 'inline pragma before code'],
    ['  *run() { return eval(this.expr); }', 'generator member (not JSDoc)'],
  ])('STILL flags eval on an executable line: %s (%s)', (content) => {
    const bundle = makeBundle({
      changedFiles: [{ path: 'src/sneaky.ts', content, reason: 'changed', lines: 1 }],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(1);
    expect(findings[0]!.cweId).toBe('CWE-94');
  });

  it('does not flag eval mentioned in a trailing // comment on an executable line', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/safe.ts',
          content: 'safeCall(input); // never use eval(input) here',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  // ---- the SQL/eval/exec detectors skip test files (pins the
  // isScannableSourceFile semantics that isTestFile alone does not cover) ----

  it('does not flag SQL or eval fixtures inside a test file', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db/__tests__/query.test.ts',
          content: [
            'const q = "SELECT * FROM users WHERE id = " + userId;',
            'const r = eval(userInput);',
          ].join('\n'),
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  // ---- ordered statement shapes (aligned with finding-integrity's
  // SQL_QUERY_SHAPE so nothing this detector emits gets downgraded) ----

  it('does not flag a template literal whose prose uses "where" as a word', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/log2.ts',
          content: 'logger.info(`this is where ${x} lives`);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  it('flags the opening line of a multi-line template query (no closing backtick needed)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db4.ts',
          content: [
            'const q = `SELECT * FROM users WHERE id = ${userId} AND',
            '  status = ${status}`;',
          ].join('\n'),
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const sql = runSecurityAgent(bundle).filter((f) => f.cweId === 'CWE-89');
    expect(sql.length).toBeGreaterThanOrEqual(1);
  });

  // Known limitations, pinned so a future change to them is a conscious one
  // (see the SQL_CONCAT_PATTERN JSDoc): a shape split across literals or lines
  // does not fire — loosening to line level would resurrect the prose FP class
  // (concatenated CLI help strings) that #984 exists to kill.
  it.each([
    ['const q = "SELECT " + cols + " FROM users";', 'shape split across literals'],
    ['const q = "SELECT id, name " +', 'multi-line concat, keyword line'],
    ['  "FROM users WHERE id = " + userId;', 'multi-line concat, companion line'],
    ['const q = `WHERE id = ${id}`;', 'bare clause fragment (integrity would downgrade)'],
  ])('documented miss (does not fire): %s (%s)', (content) => {
    const bundle = makeBundle({
      changedFiles: [{ path: 'src/db5.ts', content, reason: 'changed', lines: 1 }],
    });
    expect(runSecurityAgent(bundle).length).toBe(0);
  });

  // ---- cross-layer invariant: the detector's SQL vocabulary is a subset of
  // finding-integrity's SQL_QUERY_SHAPE, so nothing the floor emits is
  // immediately downgraded by Phase 5.75 (two definitions of "looks like SQL"
  // must not drift apart again) ----

  it('every SQL finding the detector emits survives enforceFindingIntegrity undowngraded', () => {
    const genuineShapes = [
      'const q = "SELECT * FROM users WHERE id = " + userId;',
      'const q = "INSERT INTO audit (actor) VALUES (" + actorId + ")";',
      'const q = "UPDATE users SET active = " + flag;',
      'const q = "DELETE FROM sessions WHERE id = " + id;',
      'const q = `SELECT * FROM t JOIN u ON u.id = t.id WHERE t.k = ${k}`;',
    ];
    for (const content of genuineShapes) {
      const bundle = makeBundle({
        changedFiles: [{ path: 'src/db6.ts', content, reason: 'changed', lines: 1 }],
      });
      const emitted = runSecurityAgent(bundle).filter((f) => f.cweId === 'CWE-89');
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      // Confidence reconciliation (heuristic ⇒ capped at medium) is expected;
      // what must never happen is an evidence/class downgrade or drop.
      const { findings, report } = enforceFindingIntegrity(emitted);
      expect(report.downgraded).toBe(0);
      expect(report.dropped).toBe(0);
      expect(findings[0]!.severity).toBe('critical');
    }
  });
});
