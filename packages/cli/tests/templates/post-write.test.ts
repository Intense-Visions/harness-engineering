import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureHarnessGitignore } from '../../src/templates/post-write';

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
