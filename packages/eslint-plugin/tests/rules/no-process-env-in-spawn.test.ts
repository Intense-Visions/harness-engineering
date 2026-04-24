// tests/rules/no-process-env-in-spawn.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-process-env-in-spawn';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-process-env-in-spawn', rule, {
  valid: [
    // Explicit env allowlist — correct pattern
    {
      code: `spawn('node', ['app.js'], { env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV } });`,
    },
    // No env option at all (inherits, but not our concern — developer chose to omit)
    {
      code: `spawn('node', ['app.js'], { stdio: 'pipe' });`,
    },
    // spawn with no options argument
    {
      code: `spawn('node', ['app.js']);`,
    },
    // execFile with explicit env
    {
      code: `execFile('git', ['status'], { env: { HOME: '/home/user' } });`,
    },
    // fork with no env
    {
      code: `fork('./worker.js', [], { stdio: 'pipe' });`,
    },
    // Non-spawn function with process.env is fine
    {
      code: `someOtherFunction({ env: process.env });`,
    },
    // process.env used in a non-env property
    {
      code: `spawn('node', ['app.js'], { cwd: process.env.HOME });`,
    },
    // Variable reference to env (not direct process.env)
    {
      code: `const myEnv = { PATH: process.env.PATH }; spawn('node', ['app.js'], { env: myEnv });`,
    },
    // Non-env spread is fine
    {
      code: `spawn('node', ['app.js'], { ...safeOptions });`,
    },
    // Member expression on child_process
    {
      code: `child_process.spawn('node', ['app.js'], { env: { PATH: '/usr/bin' } });`,
    },
  ],
  invalid: [
    // spawn with env: process.env
    {
      code: `spawn('node', ['app.js'], { env: process.env, stdio: 'pipe' });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // spawnSync with env: process.env
    {
      code: `spawnSync('git', ['status'], { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // execFile with env: process.env
    {
      code: `execFile('git', ['log'], { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // execFileSync with env: process.env
    {
      code: `execFileSync('npm', ['install'], { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // fork with env: process.env
    {
      code: `fork('./worker.js', [], { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // Member expression: child_process.spawn
    {
      code: `child_process.spawn('node', ['app.js'], { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // env: process.env as only option
    {
      code: `spawn('claude', args, { env: process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
    // Spread of process.env into options
    {
      code: `spawn('node', ['app.js'], { ...process.env });`,
      errors: [{ messageId: 'processEnvInSpawn' }],
    },
  ],
});
