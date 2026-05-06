// agents/skills/tests/harness-compound.test.ts
//
// Contract tests for the harness-compound skill. The skill prose itself is
// executed by an agent (not by node), so e2e correctness is human-judged.
// Phase 2 owns:
//   - the lock-primitive contract (machine-testable)
//   - fixture artifacts for the four scenarios called out by Phase 7's
//     end-to-end tests (bug-track / knowledge-track / duplicate-detection)
//
// Generic structure, schema, and platform-parity tests live in sibling files.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { acquireCompoundLock, CompoundLockHeldError } from '@harness-engineering/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('harness-compound integration', () => {
  describe('lock primitive', () => {
    it('serializes same-category invocations', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-'));
      const a = acquireCompoundLock('integration-issues', { cwd: tmp });
      expect(() => acquireCompoundLock('integration-issues', { cwd: tmp })).toThrow(
        CompoundLockHeldError
      );
      a.release();
      // Now a fresh acquire succeeds
      const b = acquireCompoundLock('integration-issues', { cwd: tmp });
      b.release();
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('parallelizes different-category invocations', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-'));
      const a = acquireCompoundLock('integration-issues', { cwd: tmp });
      const b = acquireCompoundLock('test-failures', { cwd: tmp });
      a.release();
      b.release();
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe('fixtures', () => {
    const fixturesRoot = path.resolve(__dirname, 'fixtures', 'harness-compound');

    it('bug-track fixture has expected shape', () => {
      const input = JSON.parse(
        fs.readFileSync(path.join(fixturesRoot, 'bug-track-fixture', 'input.json'), 'utf-8')
      );
      expect(input.expected.track).toBe('bug-track');
      expect(input.expected.category).toBe('integration-issues');
    });

    it('knowledge-track fixture has expected shape', () => {
      const input = JSON.parse(
        fs.readFileSync(path.join(fixturesRoot, 'knowledge-track-fixture', 'input.json'), 'utf-8')
      );
      expect(input.expected.track).toBe('knowledge-track');
      expect(input.expected.category).toBe('conventions');
    });

    it('duplicate-detection fixture seeds an existing doc', () => {
      const seedPath = path.join(
        fixturesRoot,
        'duplicate-detection-fixture',
        'docs',
        'solutions',
        'bug-track',
        'integration-issues',
        'stalled-lease-cleanup.md'
      );
      expect(fs.existsSync(seedPath)).toBe(true);
      const expected = JSON.parse(
        fs.readFileSync(
          path.join(fixturesRoot, 'duplicate-detection-fixture', 'expected.json'),
          'utf-8'
        )
      );
      expect(expected.mode).toBe('update');
    });
  });
});
