import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  installAgentRetrospectHooks,
  writeGeminiSessionEndHook,
  writeCursorRetrospectHooks,
  writeCodexNotifyHook,
  RETROSPECT_HOOK_ENTRY_NAME,
} from '../../src/hooks/agent-retrospect';
import { initHooks } from '../../src/commands/hooks/init';

/**
 * Unit tests for the multi-agent session-retrospect wiring. Each writer must
 * produce the agent's NATIVE config structure, preserve unrelated user config,
 * and be idempotent (re-running never duplicates). Codex `notify` holds a single
 * program, so a foreign notify must be reported as a conflict, never clobbered.
 */
describe('agent-retrospect writers', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-retrospect-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const CMD = 'exec node "$f"';

  describe('Gemini (.gemini/settings.json)', () => {
    it('writes a SessionEnd command hook with the harness name marker', () => {
      const p = path.join(dir, '.gemini', 'settings.json');
      expect(writeGeminiSessionEndHook(p, CMD)).toBe('installed');

      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.hooks.SessionEnd).toHaveLength(1);
      const entry = cfg.hooks.SessionEnd[0].hooks[0];
      expect(entry).toEqual({ type: 'command', command: CMD, name: RETROSPECT_HOOK_ENTRY_NAME });
    });

    it('preserves unrelated settings and other hook events', () => {
      const p = path.join(dir, '.gemini', 'settings.json');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(
        p,
        JSON.stringify({
          theme: 'dark',
          mcpServers: { harness: { command: 'harness-mcp' } },
          hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
        })
      );
      writeGeminiSessionEndHook(p, CMD);

      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.theme).toBe('dark');
      expect(cfg.mcpServers.harness.command).toBe('harness-mcp');
      expect(cfg.hooks.SessionStart).toHaveLength(1);
      expect(cfg.hooks.SessionEnd).toHaveLength(1);
    });

    it('is idempotent (re-running adds no duplicate)', () => {
      const p = path.join(dir, '.gemini', 'settings.json');
      expect(writeGeminiSessionEndHook(p, CMD)).toBe('installed');
      expect(writeGeminiSessionEndHook(p, CMD)).toBe('skipped');
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.hooks.SessionEnd).toHaveLength(1);
    });
  });

  describe('Cursor (.cursor/hooks.json)', () => {
    it('writes version 1 and both stop + sessionEnd command entries', () => {
      const p = path.join(dir, '.cursor', 'hooks.json');
      expect(writeCursorRetrospectHooks(p, CMD)).toBe('installed');

      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.version).toBe(1);
      expect(cfg.hooks.stop).toEqual([{ command: CMD }]);
      expect(cfg.hooks.sessionEnd).toEqual([{ command: CMD }]);
    });

    it('preserves an existing version and other events', () => {
      const p = path.join(dir, '.cursor', 'hooks.json');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(
        p,
        JSON.stringify({
          version: 1,
          hooks: { beforeShellExecution: [{ command: './guard.sh' }] },
        })
      );
      writeCursorRetrospectHooks(p, CMD);

      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.hooks.beforeShellExecution).toEqual([{ command: './guard.sh' }]);
      expect(cfg.hooks.stop).toEqual([{ command: CMD }]);
      expect(cfg.hooks.sessionEnd).toEqual([{ command: CMD }]);
    });

    it('is idempotent across both events', () => {
      const p = path.join(dir, '.cursor', 'hooks.json');
      expect(writeCursorRetrospectHooks(p, CMD)).toBe('installed');
      expect(writeCursorRetrospectHooks(p, CMD)).toBe('skipped');
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(cfg.hooks.stop).toHaveLength(1);
      expect(cfg.hooks.sessionEnd).toHaveLength(1);
    });
  });

  describe('Codex (.codex/config.toml)', () => {
    const SCRIPT = '/proj/.harness/hooks/session-retrospect-codex.js';

    it('inserts the notify key into an empty config', () => {
      const p = path.join(dir, '.codex', 'config.toml');
      expect(writeCodexNotifyHook(p, SCRIPT)).toBe('installed');
      const toml = fs.readFileSync(p, 'utf-8');
      expect(toml).toContain(`notify = ["node", ${JSON.stringify(SCRIPT)}]`);
    });

    it('inserts notify BEFORE the first table so it stays top-level', () => {
      const p = path.join(dir, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '[mcp_servers.harness]\ncommand = "harness"\nargs = ["mcp"]\n');
      expect(writeCodexNotifyHook(p, SCRIPT)).toBe('installed');

      const toml = fs.readFileSync(p, 'utf-8');
      const notifyIdx = toml.indexOf('notify =');
      const tableIdx = toml.indexOf('[mcp_servers.harness]');
      expect(notifyIdx).toBeGreaterThanOrEqual(0);
      expect(notifyIdx).toBeLessThan(tableIdx);
      // The existing table is preserved intact.
      expect(toml).toContain('command = "harness"');
    });

    it('is idempotent (a harness notify already present is skipped)', () => {
      const p = path.join(dir, '.codex', 'config.toml');
      expect(writeCodexNotifyHook(p, SCRIPT)).toBe('installed');
      expect(writeCodexNotifyHook(p, SCRIPT)).toBe('skipped');
      const occurrences = fs.readFileSync(p, 'utf-8').match(/notify =/g) ?? [];
      expect(occurrences).toHaveLength(1);
    });

    it('never clobbers a foreign notify — reports a conflict', () => {
      const p = path.join(dir, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'notify = ["python3", "/home/me/my-notify.py"]\n');
      expect(writeCodexNotifyHook(p, SCRIPT)).toBe('conflict');
      // The user's notify is untouched.
      expect(fs.readFileSync(p, 'utf-8')).toBe('notify = ["python3", "/home/me/my-notify.py"]\n');
    });
  });

  describe('installAgentRetrospectHooks', () => {
    const buildCommand = (name: string) => `exec node ".harness/hooks/${name}.js"`;

    it('wires only the agents whose detect dir is present', () => {
      // Only .gemini and .cursor exist; .codex is absent.
      fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
      fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });

      const results = installAgentRetrospectHooks({ projectDir: dir, buildCommand });
      const agents = results.map((r) => r.agent).sort();
      expect(agents).toEqual(['Cursor', 'Gemini CLI']);
      expect(results.every((r) => r.status === 'installed')).toBe(true);
      expect(fs.existsSync(path.join(dir, '.gemini', 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.cursor', 'hooks.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.codex', 'config.toml'))).toBe(false);
    });

    it('returns an empty result set for a Claude-only project', () => {
      expect(installAgentRetrospectHooks({ projectDir: dir, buildCommand })).toEqual([]);
    });
  });
});

/**
 * Integration: initHooks itself wires detected agents at standard profile, and
 * does NOT at minimal (session-retrospect absent). Ships the per-agent entry
 * scripts + core into .harness/hooks/ as support files.
 */
describe('initHooks multi-agent wiring', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-multiagent-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('wires detected agents and ships the per-agent scripts at standard profile', () => {
    fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });

    const result = initHooks({ profile: 'standard', projectDir: dir });
    const byAgent = Object.fromEntries(result.agentRetrospect.map((r) => [r.agent, r.status]));
    expect(byAgent).toEqual({
      'Gemini CLI': 'installed',
      'Codex CLI': 'installed',
      Cursor: 'installed',
    });

    // Support scripts shipped into .harness/hooks/.
    const hooksDir = path.join(dir, '.harness', 'hooks');
    for (const f of [
      'session-retrospect.js',
      'session-retrospect-core.js',
      'session-retrospect-gemini.js',
      'session-retrospect-codex.js',
      'session-retrospect-cursor.js',
    ]) {
      expect(fs.existsSync(path.join(hooksDir, f))).toBe(true);
    }

    // Each agent config points at its own entry script.
    const gemini = JSON.parse(fs.readFileSync(path.join(dir, '.gemini', 'settings.json'), 'utf-8'));
    expect(gemini.hooks.SessionEnd[0].hooks[0].command).toContain('session-retrospect-gemini.js');
    const cursor = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'hooks.json'), 'utf-8'));
    expect(cursor.hooks.stop[0].command).toContain('session-retrospect-cursor.js');
    const codex = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf-8');
    expect(codex).toContain('session-retrospect-codex.js');
  });

  it('is idempotent — re-running initHooks does not duplicate agent config', () => {
    fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
    initHooks({ profile: 'standard', projectDir: dir });
    const second = initHooks({ profile: 'standard', projectDir: dir });
    expect(second.agentRetrospect.find((r) => r.agent === 'Gemini CLI')?.status).toBe('skipped');
    const gemini = JSON.parse(fs.readFileSync(path.join(dir, '.gemini', 'settings.json'), 'utf-8'));
    expect(gemini.hooks.SessionEnd).toHaveLength(1);
  });

  it('does NOT wire agents at minimal profile (session-retrospect absent)', () => {
    fs.mkdirSync(path.join(dir, '.gemini'), { recursive: true });
    const result = initHooks({ profile: 'minimal', projectDir: dir });
    expect(result.agentRetrospect).toEqual([]);
    expect(fs.existsSync(path.join(dir, '.gemini', 'settings.json'))).toBe(false);
  });
});
