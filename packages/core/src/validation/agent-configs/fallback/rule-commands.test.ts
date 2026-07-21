import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCommandRules } from './rule-commands';

/**
 * Hermetic tests for runCommandRules (HARNESS-AC-060 command-file-exists).
 *
 * The rule scans `agents/commands/**\/*.md` under `cwd`, extracts inline markdown
 * link targets `[label](path)`, resolves relative targets against the file's
 * directory, and emits a finding for every link whose target file is missing.
 *
 * Tests run against an isolated temp directory (no shared state, no network, no
 * subprocess) so behavior is deterministic.
 */

const RULE_ID = 'HARNESS-AC-060';
const COMMANDS_DIR = path.join('agents', 'commands');

describe('runCommandRules', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-commands-'));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  /** Write a command markdown file at agents/commands/<name>, creating parents. */
  function writeCommand(name: string, content: string): string {
    const abs = path.join(cwd, COMMANDS_DIR, name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
  }

  /** Write an arbitrary file relative to cwd so links can resolve to it. */
  function writeFile(relative: string, content = 'x'): void {
    const abs = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  it('returns no findings when there are no command files', async () => {
    const findings = await runCommandRules(cwd);
    expect(findings).toEqual([]);
  });

  it('flags a relative link that points at a non-existent sibling file', async () => {
    writeCommand('deploy.md', 'See [the runbook](runbook.md) for details.');

    const findings = await runCommandRules(cwd);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.ruleId).toBe(RULE_ID);
    expect(finding.severity).toBe('warning');
    expect(finding.message).toBe("Command references missing file 'runbook.md'");
    expect(finding.suggestion).toBe('Fix the path or remove the broken reference');
    // File path is reported relative to cwd, using forward slashes.
    expect(finding.file).toBe('agents/commands/deploy.md');
  });

  it('does not flag a relative link whose target file exists on disk', async () => {
    writeCommand('deploy.md', 'See [the runbook](runbook.md) for details.');
    writeFile(path.join(COMMANDS_DIR, 'runbook.md'));

    const findings = await runCommandRules(cwd);

    expect(findings).toEqual([]);
  });

  it('resolves relative targets against the command file directory, not cwd', async () => {
    // Link target `../shared/helper.md` must resolve relative to the command's
    // own directory. Place the command one level deep and the target accordingly.
    writeCommand(path.join('sub', 'cmd.md'), 'Uses [helper](../shared/helper.md).');
    writeFile(path.join(COMMANDS_DIR, 'shared', 'helper.md'));

    const findings = await runCommandRules(cwd);

    expect(findings).toEqual([]);
  });

  it('ignores http(s) links, anchor-only links, and strips fragments/queries', async () => {
    writeCommand(
      'links.md',
      [
        '[web](https://example.com/x)',
        '[insecure](http://example.com/y)',
        '[anchor](#section)',
      ].join('\n')
    );

    const findings = await runCommandRules(cwd);

    expect(findings).toEqual([]);
  });

  it('strips a fragment before checking existence so an existing file is not flagged', async () => {
    writeCommand('doc.md', 'Jump to [section](guide.md#setup).');
    writeFile(path.join(COMMANDS_DIR, 'guide.md'));

    const findings = await runCommandRules(cwd);

    expect(findings).toEqual([]);
  });

  it('reports the fragment-stripped target string in the finding message', async () => {
    writeCommand('doc.md', 'Jump to [section](missing.md#setup).');

    const findings = await runCommandRules(cwd);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("Command references missing file 'missing.md'");
  });

  it('emits one finding per distinct broken link within a single file', async () => {
    writeCommand('multi.md', 'See [a](a.md) and [b](b.md) and [c](c.md).');

    const findings = await runCommandRules(cwd);

    const targets = findings.map((f) => f.message);
    expect(findings).toHaveLength(3);
    expect(targets).toEqual(
      expect.arrayContaining([
        "Command references missing file 'a.md'",
        "Command references missing file 'b.md'",
        "Command references missing file 'c.md'",
      ])
    );
  });

  it('scans nested command files recursively', async () => {
    writeCommand(path.join('group', 'nested.md'), 'Broken [link](gone.md).');

    const findings = await runCommandRules(cwd);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('agents/commands/group/nested.md');
  });

  it('aggregates findings across multiple command files', async () => {
    writeCommand('one.md', 'Broken [x](x.md).');
    writeCommand('two.md', 'Broken [y](y.md).');

    const findings = await runCommandRules(cwd);

    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('does not flag content with no markdown links at all', async () => {
    writeCommand('plain.md', '# Title\n\nJust prose, no links here.');

    const findings = await runCommandRules(cwd);

    expect(findings).toEqual([]);
  });
});
