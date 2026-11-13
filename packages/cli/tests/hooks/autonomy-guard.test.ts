import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HOOK_SCRIPTS } from '../../src/hooks/profiles';

/**
 * D16 / I1(b): PreToolUse guard that narrows the same-user residual of the threat model.
 * Blocks agent Bash invocations of `harness autonomy set` that raise (or whose arguments are
 * not literally a lowering), and agent Bash/Write/Edit targeting ~/.harness/config.json,
 * ~/.harness/session-overrides/ or ~/.harness/autonomy-audit.log. Lowerings stay allowed.
 */
const HOOK_PATH = path.resolve(__dirname, '../../src/hooks/autonomy-guard.js');
let home: string;
let project: string;

beforeAll(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-guard-home-')));
  project = path.join(home, 'work', 'proj');
  fs.mkdirSync(path.join(home, '.harness', 'session-overrides', 'abc'), { recursive: true });
  fs.mkdirSync(project, { recursive: true });
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

function runHook(payload: unknown): { exitCode: number; stderr: string } {
  const res = spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 60000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return { exitCode: res.status ?? 1, stderr: res.stderr ?? '' };
}
const bash = (command: string) =>
  runHook({ tool_name: 'Bash', tool_input: { command }, cwd: project });
const write = (tool: string, file_path: string) =>
  runHook({ tool_name: tool, tool_input: { file_path, content: '{}' }, cwd: project });

describe('autonomy-guard: raising `harness autonomy set` from Bash is blocked', () => {
  it.each([
    'harness autonomy set trusted --session s1',
    'npx harness autonomy set trusted --session s1',
    'node packages/cli/dist/bin/harness.js autonomy set --audit off --session s1',
    'harness autonomy set --audit=off --session s1',
    'harness autonomy set supervised --audit off --session s1',
    'harness autonomy set trusted --for 7d --session s1',
    "harness autonomy set 'trusted' --session s1",
    'harness autonomy set $LEVEL --session s1',
    'harness autonomy set --audit "$A" --session s1',
    'cd /tmp && harness autonomy set trusted --session s1',
    'true; harness --json autonomy set trusted --session s1',
    "bash -c 'harness autonomy set trusted --session s1'",
    'sh -c "harness autonomy set trusted --session s1"',
    'echo "$(harness autonomy set trusted --session s1)"',
    'echo `harness autonomy set trusted --session s1`',
    'bash <<EOF\nharness autonomy set trusted --session s1\nEOF',
    "eval 'harness autonomy set trusted --session s1'",
  ])('blocks %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED/);
    expect(stderr).toMatch(/autonomy set/);
  });
});

// B1: a quoted word with no whitespace and no `$` is the same word to the shell, and a
// backslash before a word character is a no-op — both must be seen through. Each variant is
// also wrapped in a `script(1)` pty with a piped confirmation, the shape that was proven to
// land a raise end to end.
const QUOTE_EVASIONS = [
  'harness "autonomy" set trusted --session s1',
  'harness autonomy "set" trusted --session s1',
  "harness 'autonomy' 'set' trusted --session s1",
  'harness autonom\\y set trusted --session s1',
];
const PTY_WRAP = (c: string) => `(sleep 1; echo y) | script -q /dev/null ${c}`;

describe('autonomy-guard: quoting / backslash-escaping the subcommand does not evade (B1)', () => {
  it.each([...QUOTE_EVASIONS, ...QUOTE_EVASIONS.map(PTY_WRAP)])('blocks %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/autonomy set/);
  });

  it.each([
    'harness "autonomy" set supervised --session s1',
    "harness 'autonomy' 'set' 'supervised' --session s1",
    'harness autonom\\y set --audit on --session s1',
    PTY_WRAP('harness "autonomy" "set" supervised --session s1'),
    'git commit -m "docs: never run harness autonomy set trusted from an agent"',
    'git commit -m \'note: harness "autonomy" set trusted is human-only\'',
  ])('allows %j (lowering / commit-message control)', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
});

// N1: cheap rules for indirection the literal matcher cannot follow — a harness invocation
// whose arguments are built at runtime, and a cd / variable aimed at ~/.harness.
describe('autonomy-guard: dynamic harness arguments are blocked (N1)', () => {
  it.each([
    'A=autonomy; harness $A set trusted --session s1',
    'harness ${A:-autonomy} set trusted --session s1',
    'harness "$A" set trusted --session s1',
    'harness autonomy $(echo set) trusted --session s1',
    'harness autonomy `echo set` trusted --session s1',
    "harness $'autonomy' set trusted --session s1",
    'npx harness $SUB set trusted --session s1',
    'node packages/cli/dist/bin/harness.js $SUB set trusted',
    './node_modules/.bin/harness $SUB set trusted',
    '(sleep 1; echo y) | script -q /dev/null harness $A set trusted --session s1',
  ])('blocks %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED/);
  });
});

describe('autonomy-guard: cd / variable assignment aimed at ~/.harness is blocked (N1)', () => {
  it.each([
    'cd ~/.harness && echo x > config.json',
    'cd $HOME/.harness; rm -rf session-overrides',
    'cd "${HOME}/.harness" && ls',
    'D=~/.harness; echo x > $D/config.json',
    'export H=$HOME/.harness; echo x > $H/config.json',
  ])('blocks %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED/);
  });

  it.each([
    'harness autonomy set supervised --session s1',
    'cd /tmp && harness autonomy set supervised --session s1',
    'L=supervised; harness autonomy set supervised --audit on --session s1',
    'ls ~/.harness/sessions',
    'cd packages/cli && npm test',
    'echo $HOME && harness autonomy show --session s1',
  ])('allows %j (lowering / unrelated control)', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
});

describe('autonomy-guard: lowerings and unrelated commands are allowed (positive controls)', () => {
  it.each([
    'harness autonomy set supervised --session s1',
    'harness autonomy set --audit on --session s1',
    'harness autonomy set supervised --audit=on --session s1',
    'harness autonomy show --session s1',
    'harness autonomy set --help',
    "echo 'harness autonomy set trusted'",
    'git commit -m "$(cat <<\'EOF\'\nfeat: document harness autonomy set trusted\nEOF\n)"',
    'git commit -m "$(cat <<\'EOF\'\ndocs: overrides live in ~/.harness/session-overrides/\nEOF\n)"',
    'cat harness.config.json',
    'ls ~/.harness/sessions',
    'npm test',
  ])('allows %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
});

describe('autonomy-guard: Bash touching user-level autonomy state is blocked', () => {
  it.each([
    "echo '{}' > ~/.harness/config.json",
    'cat x > "$HOME/.harness/config.json"',
    'cp x ${HOME}/.harness/config.json',
    'rm -rf ~/.harness/session-overrides',
    "sed -i '' s/a/b/ ~/.harness/session-overrides/abc/s1.json",
    ': > ~/.harness/autonomy-audit.log',
    'echo x > ~/.harness/./config.json',
    'echo x > ~/.harness//config.json',
    'cat ~/.harness/config.json',
  ])('blocks %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED/);
  });

  it('blocks the literal absolute home path too', () => {
    expect(bash(`echo x > ${home}/.harness/config.json`).exitCode).toBe(2);
  });
});

describe('autonomy-guard: Write/Edit targeting user-level autonomy state is blocked', () => {
  it.each(['Write', 'Edit', 'MultiEdit'])('%s to ~/.harness/config.json', (tool) => {
    expect(write(tool, path.join(home, '.harness', 'config.json')).exitCode).toBe(2);
  });
  it('tilde form', () => {
    expect(write('Write', '~/.harness/config.json').exitCode).toBe(2);
  });
  it('a file under session-overrides', () => {
    expect(
      write('Write', path.join(home, '.harness', 'session-overrides', 'abc', 's1.json')).exitCode
    ).toBe(2);
  });
  it('the audit log', () => {
    expect(write('Edit', path.join(home, '.harness', 'autonomy-audit.log')).exitCode).toBe(2);
  });
  it('a relative path that resolves into ~/.harness from the cwd', () => {
    expect(write('Write', '../../.harness/config.json').exitCode).toBe(2);
  });
  it('a case variant (case-insensitive filesystems)', () => {
    expect(write('Write', path.join(home, '.HARNESS', 'Config.JSON')).exitCode).toBe(2);
  });
  it.skipIf(process.platform === 'win32')(
    'a symlinked directory that points into ~/.harness',
    () => {
      const link = path.join(home, 'work', 'sneaky');
      fs.symlinkSync(path.join(home, '.harness'), link);
      try {
        expect(write('Write', path.join(link, 'config.json')).exitCode).toBe(2);
      } finally {
        fs.unlinkSync(link);
      }
    }
  );

  it.each([
    ['project session notes', () => path.join(project, '.harness', 'sessions', 's1', 'notes.md')],
    ['project harness.config.json', () => path.join(project, 'harness.config.json')],
    ['another file in ~/.harness', () => path.join(home, '.harness', 'cache', 'x.json')],
  ])('allows %s (positive control)', (_n, p) => {
    const { exitCode, stderr } = write('Write', p());
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
});

/**
 * Phase 2 (decision log): an agent with Write/Edit/Bash could rewrite
 * .harness/sessions/<slug>/auto-decisions.jsonl directly, bypassing the append-only
 * record_auto_decision path. The guard blocks agent writes to it; reads stay allowed, and the
 * MCP tool never passes through this hook.
 */
describe('autonomy-guard: agent writes to auto-decisions.jsonl are blocked (decision log)', () => {
  const log = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
  const read = (file_path: string) =>
    runHook({ tool_name: 'Read', tool_input: { file_path }, cwd: project });

  it.each(['Write', 'Edit', 'MultiEdit'])('%s to the absolute log path', (tool) => {
    const { exitCode, stderr } = write(tool, log());
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED: .*auto-decisions\.jsonl.*record_auto_decision/);
  });
  it('a relative path resolved against the payload cwd', () => {
    expect(write('Write', '.harness/sessions/s1/auto-decisions.jsonl').exitCode).toBe(2);
    expect(write('Edit', './.harness/sessions/other/auto-decisions.jsonl').exitCode).toBe(2);
  });
  it('a ..-laundered and a case-variant path', () => {
    expect(write('Write', '.harness/sessions/x/../s1/auto-decisions.jsonl').exitCode).toBe(2);
    expect(write('Write', '.HARNESS/Sessions/s1/Auto-Decisions.JSONL').exitCode).toBe(2);
  });

  it.each([
    'echo {} >> .harness/sessions/s1/auto-decisions.jsonl',
    'echo {} > .harness/sessions/s1/auto-decisions.jsonl',
    ': > "$PWD/.harness/sessions/s1/auto-decisions.jsonl"',
    'printf x 1>>.harness/sessions/s1/auto-decisions.jsonl',
    'echo x | tee -a .harness/sessions/s1/auto-decisions.jsonl',
    // a read-only command is still a write when it redirects into the log
    'cat /tmp/forged.jsonl > .harness/sessions/s1/auto-decisions.jsonl',
    'jq -c . /tmp/x.json >> .harness/sessions/s1/auto-decisions.jsonl',
    'cat .harness/sessions/s1/auto-decisions.jsonl 1<>.harness/sessions/s1/auto-decisions.jsonl',
    'rm .harness/sessions/s1/auto-decisions.jsonl',
    'truncate -s 0 .harness/sessions/s1/auto-decisions.jsonl',
    "sed -i '' 1d .harness/sessions/s1/auto-decisions.jsonl",
    'mv /tmp/forged.jsonl .harness/sessions/s1/auto-decisions.jsonl',
    'cp /tmp/forged.jsonl .harness/sessions/s1/auto-decisions.jsonl',
    'cd .harness/sessions/s1 && echo x >> auto-decisions.jsonl',
    'F=.harness/sessions/s1/auto-decisions.jsonl; echo x >> $F',
    'echo x >> .harness/sessions/s1/auto-"decisions".jsonl',
    "node -e \"require('fs').writeFileSync('.harness/sessions/s1/auto-decisions.jsonl','')\"",
    "bash -c 'echo x >> .harness/sessions/s1/auto-decisions.jsonl'",
  ])('blocks Bash %j', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/BLOCKED/);
  });
  it('blocks the literal absolute path in Bash', () => {
    expect(bash(`echo x >> ${log()}`).exitCode).toBe(2);
  });

  it.each([
    'cat .harness/sessions/s1/auto-decisions.jsonl',
    'tail -n 5 .harness/sessions/s1/auto-decisions.jsonl | jq .',
    'wc -l .harness/sessions/s1/auto-decisions.jsonl',
    'grep judgment .harness/sessions/s1/auto-decisions.jsonl > /tmp/judgments.txt',
    'harness autonomy log --session s1',
    'git commit -m "$(cat <<\'EOF\'\ndocs: auto-decisions.jsonl is append-only\nEOF\n)"',
  ])('allows read-only Bash %j (control)', (command) => {
    const { exitCode, stderr } = bash(command);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
  it('allows cat of the literal absolute path (control)', () => {
    const { exitCode, stderr } = bash(`cat ${log()}`);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
  it('allows the Read tool on the log (read control)', () => {
    const { exitCode, stderr } = read(log());
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
  });
  it('allows writes to other files in the session dir (control)', () => {
    expect(
      write('Write', path.join(project, '.harness', 'sessions', 's1', 'state.json')).exitCode
    ).toBe(0);
  });
  it('allows a record_auto_decision MCP payload, and its tool never matches the hook', () => {
    const mcp = runHook({
      tool_name: 'mcp__harness__record_auto_decision',
      tool_input: { path: project, session: 's1', skill: 'x' },
      cwd: project,
    });
    expect(mcp.exitCode).toBe(0);
    const matcher = HOOK_SCRIPTS.find((h) => h.name === 'autonomy-guard')?.matcher;
    expect(matcher).toBeDefined();
    const re = new RegExp(`^(?:${matcher})$`);
    expect(re.test('Write')).toBe(true); // positive control
    expect(re.test('mcp__harness__record_auto_decision')).toBe(false);
    expect(re.test('Read')).toBe(false);
  });
});

describe('autonomy-guard: input handling', () => {
  it('empty stdin is allowed (no payload)', () => {
    expect(runHook('').exitCode).toBe(0);
  });
  it('malformed JSON is allowed (consistent with block-no-verify)', () => {
    expect(runHook('{nope').exitCode).toBe(0);
  });
});
