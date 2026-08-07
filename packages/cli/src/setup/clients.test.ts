import { describe, it, expect } from 'vitest';
import { SETUP_CLIENTS } from './clients';

/**
 * These clients are the ones `harness setup` (runMcpSetup in
 * packages/cli/src/commands/setup.ts) detects and configures MCP for.
 * The parity test asserts SETUP_CLIENTS is exactly this set, so a client
 * added in one place cannot silently miss the other. If you add/remove a
 * detected client in setup.ts, update this list in the SAME commit.
 */
const SETUP_DETECTED_CLIENT_KEYS = [
  'claude',
  'cursor',
  'gemini',
  'codex',
  'opencode',
  'antigravity',
];

describe('SETUP_CLIENTS', () => {
  it('covers exactly the clients harness setup detects', () => {
    const keys = SETUP_CLIENTS.map((c) => c.client).sort();
    expect(keys).toEqual([...SETUP_DETECTED_CLIENT_KEYS].sort());
  });

  it('gives every client a non-empty detectDir, name, and configTarget', () => {
    for (const c of SETUP_CLIENTS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.detectDir.length).toBeGreaterThan(0);
      expect(c.configTarget.length).toBeGreaterThan(0);
    }
  });

  it('references only real marketplace plugin names for plugin clients', () => {
    const allowed = new Set([
      'harness-claude',
      'harness-cursor',
      'harness-gemini',
      'harness-codex',
      'harness-antigravity',
    ]);
    for (const c of SETUP_CLIENTS) {
      if (c.install.kind === 'plugin') {
        expect(c.install.marketplace).toBe('Intense-Visions/harness-engineering');
        expect(allowed.has(c.install.plugin)).toBe(true);
      } else {
        expect(c.install.pkg).toBe('@harness-engineering/cli');
        expect(c.install.setup).toBe('harness setup');
      }
    }
  });

  it('uses POSIX-style detectDir strings (no backslashes)', () => {
    for (const c of SETUP_CLIENTS) {
      expect(c.detectDir).not.toContain('\\');
    }
  });
});
