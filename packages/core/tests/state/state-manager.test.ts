// packages/core/tests/state/state-manager.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendLearning } from '../../src/state';

// Note: loadState/saveState describe blocks were removed in Phase 6 — those
// deprecated persistence functions are deleted (event-sourced state model).
// State read/write behavior is now covered by event-sourcing/migrate.test.ts and
// the core-state projection tests.

describe('appendLearning', () => {
  it('creates learnings.md and appends', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    await appendLearning(tmpDir, 'First learning');
    await appendLearning(tmpDir, 'Second learning');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First learning');
    expect(content).toContain('Second learning');
    fs.rmSync(tmpDir, { recursive: true });
  });
});
