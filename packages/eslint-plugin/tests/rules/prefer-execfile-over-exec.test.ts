// tests/rules/prefer-execfile-over-exec.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/prefer-execfile-over-exec';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('prefer-execfile-over-exec', rule, {
  valid: [
    // execFile / execFileSync are the recommended form — never flagged
    { code: `execFile('git', ['status'], callback);` },
    { code: `execFileSync('rm', ['-rf', 'dist']);` },
    { code: `child_process.execFile('git', ['pull']);` },
    { code: `cp.execFileSync('node', ['build.js']);` },

    // RegExp.prototype.exec must NOT be flagged (the key false-positive guard)
    { code: `myRegex.exec(input);` },
    { code: `/ab+c/.exec(str);` },
    { code: `pattern.exec('some literal string');` },
    { code: `const m = SEMVER_RE.exec(version);` },

    // Dynamic (non-string) first argument is not flagged — cannot verify it is a shell string
    { code: `exec(dynamicCommand, callback);` },
    { code: `execSync(buildCommand);` },
    { code: `child_process.exec(cmdVar);` },

    // exec with no arguments (defensive)
    { code: `exec();` },

    // A member .exec on a non-child_process object with a string arg stays valid
    { code: `router.exec('GET /users');` },
  ],
  invalid: [
    // bare exec with a string literal command
    {
      code: `exec('rm -rf dist', callback);`,
      errors: [{ messageId: 'preferExecFile' }],
    },
    // bare execSync with shell operators — message interpolates the fn name
    {
      code: `execSync('tsc && cp a b');`,
      errors: [{ messageId: 'preferExecFile', data: { fn: 'execSync' } }],
    },
    // bare exec message interpolates 'exec'
    {
      code: `exec('ls');`,
      errors: [{ messageId: 'preferExecFile', data: { fn: 'exec' } }],
    },
    // bare exec with a template literal (injection surface)
    {
      code: 'exec(`git checkout ${branch}`);',
      errors: [{ messageId: 'preferExecFile' }],
    },
    // member child_process.exec with a template literal
    {
      code: 'child_process.exec(`git log ${range}`);',
      errors: [{ messageId: 'preferExecFile' }],
    },
    // member alias cp.execSync with a string literal
    {
      code: `cp.execSync('node build.js');`,
      errors: [{ messageId: 'preferExecFile' }],
    },
    // execSync as a member on a child_process alias — flagged
    {
      code: `childProcess.execSync('ls -la');`,
      errors: [{ messageId: 'preferExecFile' }],
    },
    // execSync as a member on a NON-alias object is still flagged (execSync is
    // unambiguous — RegExp has no execSync, so no object-name gate applies)
    {
      code: `shellHelper.execSync('ls -la');`,
      errors: [{ messageId: 'preferExecFile' }],
    },
  ],
});
