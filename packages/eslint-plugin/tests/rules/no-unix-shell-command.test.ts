// tests/rules/no-unix-shell-command.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-unix-shell-command';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-unix-shell-command', rule, {
  valid: [
    // execFile with git is fine (cross-platform binary)
    { code: `execFile('git', ['status'], callback);` },
    // execFileSync with git is fine
    { code: `execFileSync('git', ['log', '--oneline']);` },
    // exec with non-unix command
    { code: `exec('node build.js', callback);` },
    // execSync with non-unix command
    { code: `execSync('tsc --noEmit');` },
    // Member expression: child_process.execFile
    { code: `child_process.execFile('git', ['pull']);` },
    // String with unix command name but not in exec context
    { code: `const cmd = 'rm -rf dist';` },
    // execFile with rm (execFile is intentionally allowed)
    { code: `execFile('rm', ['-rf', 'dist']);` },
    // execFileSync with cp (execFile is intentionally allowed)
    { code: `execFileSync('cp', ['-r', 'src', 'dist']);` },
  ],
  invalid: [
    // exec with rm
    {
      code: `exec('rm -rf dist', callback);`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with rm -rf
    {
      code: `execSync('rm -rf dist');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // exec with cp
    {
      code: `exec('cp -r src dest');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with mv
    {
      code: `execSync('mv old.txt new.txt');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // exec with mkdir -p
    {
      code: `exec('mkdir -p /tmp/foo');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with chmod
    {
      code: `execSync('chmod 755 script.sh');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // execSync with chown
    {
      code: `execSync('chown root:root file');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Member expression: child_process.exec with unix command
    {
      code: `child_process.exec('rm -rf node_modules');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Member expression: child_process.execSync
    {
      code: `child_process.execSync('cp file1 file2');`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
    // Template literal with unix command
    {
      code: `execSync(\`rm -rf \${dir}\`);`,
      errors: [{ messageId: 'unixShellCommand' }],
    },
  ],
});
