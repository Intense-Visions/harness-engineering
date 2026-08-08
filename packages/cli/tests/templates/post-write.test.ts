import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ensureHarnessGitignore,
  applyEcosystemAfterCreate,
} from '../../src/templates/post-write';

describe('ensureHarnessGitignore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gitignore-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/.gitignore when it does not exist', () => {
    ensureHarnessGitignore(tmpDir);
    const gitignorePath = path.join(tmpDir, '.harness', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('graph/');
    expect(content).toContain('debug/');
    expect(content).toContain('state.json');
    // Event-sourcing runtime state (constants.ts EVENT_LOG_FILE / SNAPSHOT_FILE)
    expect(content).toContain('state.events.jsonl');
    expect(content).toContain('state.snapshot.json');
  });

  it('creates .harness/.gitignore when .harness dir already exists', () => {
    // Simulate an existing project with .harness/ but no .gitignore
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.harness', 'state.json'), '{}');

    ensureHarnessGitignore(tmpDir);
    const gitignorePath = path.join(tmpDir, '.harness', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('state.json');
  });

  it('updates .harness/.gitignore when it already exists with stale content', () => {
    // Simulate an old .gitignore missing newer entries
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.harness', '.gitignore'), 'graph/\ndebug/\n');

    ensureHarnessGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', '.gitignore'), 'utf-8');
    // Should now contain all canonical entries, including newer ones
    expect(content).toContain('.install-id');
    expect(content).toContain('.telemetry-notice-shown');
    expect(content).toContain('telemetry.json');
    expect(content).toContain('webhook-queue.sqlite');
    expect(content).toContain('webhook-queue.sqlite-wal');
    expect(content).toContain('webhook-queue.sqlite-shm');
    expect(content).toContain('maintenance/');
  });

  // Issue #360: custom entries added by users must survive MCP restarts.
  it('preserves custom entries when merging into an existing .gitignore', () => {
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.harness', '.gitignore'),
      'graph/\ndebug/\nknowledge/\nmy-secret-notes.md\n'
    );

    ensureHarnessGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', '.gitignore'), 'utf-8');
    // Custom entries preserved
    expect(content).toContain('knowledge/');
    expect(content).toContain('my-secret-notes.md');
    // Template entries added
    expect(content).toContain('telemetry.json');
    expect(content).toContain('maintenance/');
    // No duplicate of pre-existing entries
    const graphCount = content.split('\n').filter((l) => l.trim() === 'graph/').length;
    expect(graphCount).toBe(1);
  });

  it('does not modify a .gitignore that already contains all template entries', () => {
    ensureHarnessGitignore(tmpDir);
    const gitignorePath = path.join(tmpDir, '.harness', '.gitignore');
    const before = fs.readFileSync(gitignorePath, 'utf-8');

    ensureHarnessGitignore(tmpDir);
    const after = fs.readFileSync(gitignorePath, 'utf-8');
    expect(after).toBe(before);
  });

  // Issue #270: hooks/ are team-policy code and security/timeline.json is a shared
  // trend ledger — both must be tracked by default. Pin the .gitignore semantics so
  // future edits cannot quietly opt them back out.
  it('does not ignore .harness/hooks/ wholesale (team-policy scripts are tracked)', () => {
    ensureHarnessGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', '.gitignore'), 'utf-8');
    const lines = content.split(/\r?\n/);
    expect(lines).not.toContain('hooks/');
    expect(lines).not.toContain('hooks');
    expect(lines).not.toContain('hooks/*');
  });

  it('tracks security/timeline.json while ignoring other security/* artifacts', () => {
    ensureHarnessGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', '.gitignore'), 'utf-8');
    const lines = content.split(/\r?\n/);
    expect(lines).not.toContain('security/');
    expect(lines).toContain('security/*');
    expect(lines).toContain('!security/timeline.json');
  });
});

describe('applyEcosystemAfterCreate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-aftercreate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const CONFIG = 'harness.orchestrator.md';
  function writeConfig(
    dir: string,
    afterCreateLine = "  afterCreate: 'pnpm install --prefer-offline'"
  ) {
    fs.writeFileSync(
      path.join(dir, CONFIG),
      ['---', 'hooks:', afterCreateLine, '  beforeRun: null', '---', ''].join('\n')
    );
  }

  it('rewrites afterCreate to the pnpm install command for a node-pnpm workspace', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    writeConfig(tmpDir);
    const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
    expect(res.ecosystem?.id).toBe('node-pnpm');
    expect(res.rewritten).toBe(true);
    expect(res.installCommand).toBe('pnpm install');
    const out = fs.readFileSync(path.join(tmpDir, CONFIG), 'utf-8');
    expect(out).toContain("  afterCreate: 'pnpm install'");
    expect(out).not.toContain('--prefer-offline');
    expect(out).toContain('  beforeRun: null'); // sibling hook untouched
  });

  it('rewrites afterCreate to uv sync for a non-node (uv.lock) workspace', () => {
    fs.writeFileSync(path.join(tmpDir, 'uv.lock'), '');
    writeConfig(tmpDir);
    const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
    expect(res.ecosystem?.id).toBe('python-uv');
    expect(res.installCommand).toBe('uv sync');
    const out = fs.readFileSync(path.join(tmpDir, CONFIG), 'utf-8');
    expect(out).toContain("  afterCreate: 'uv sync'");
    expect(out).not.toMatch(/pnpm/);
  });

  it('returns ecosystem null for an unrecognized (empty) workspace and does not rewrite', () => {
    writeConfig(tmpDir); // config present, but no lockfile/manifest markers
    const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
    expect(res.ecosystem).toBeNull();
    expect(res.rewritten).toBe(false);
  });

  it('no-ops when the orchestrator config is absent from the write set', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    writeConfig(tmpDir); // file on disk, but NOT passed in writtenFiles
    const res = applyEcosystemAfterCreate(tmpDir, []);
    expect(res.orchestratorConfigWritten).toBe(false);
    expect(res.rewritten).toBe(false);
  });

  it('no-ops without throwing when the afterCreate line is missing/malformed', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(
      path.join(tmpDir, CONFIG),
      ['---', 'hooks:', '  beforeRun: null', '---', ''].join('\n')
    );
    const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
    expect(res.rewritten).toBe(false); // no throw
  });

  it('leaves an empty-value afterCreate line (and its sibling) untouched', () => {
    // An `afterCreate:` line with no value must not match — the separator is
    // `[ \t]`, not `\s`, so the rewrite cannot consume the following newline and
    // delete the next sibling hook line.
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(
      path.join(tmpDir, CONFIG),
      ['---', 'hooks:', '  afterCreate:', '  beforeRun: null', '---', ''].join('\n')
    );
    const res = applyEcosystemAfterCreate(tmpDir, [CONFIG]);
    expect(res.rewritten).toBe(false);
    const out = fs.readFileSync(path.join(tmpDir, CONFIG), 'utf-8');
    expect(out).toContain('  afterCreate:'); // empty-value line preserved
    expect(out).toContain('  beforeRun: null'); // sibling not consumed
  });
});
