import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadNotificationsConfig } from '../../src/notifications/config-loader';

function mkTmpProject(json: unknown | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-cfg-'));
  if (json !== null) {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(json, null, 2));
  }
  return dir;
}

describe('loadNotificationsConfig', () => {
  let dir: string;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns Ok with empty sinks when the config file is absent', () => {
    dir = mkTmpProject(null);
    const r = loadNotificationsConfig(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sinks).toEqual([]);
  });

  it('returns Ok with empty sinks when the section is missing', () => {
    dir = mkTmpProject({ version: 1 });
    const r = loadNotificationsConfig(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sinks).toEqual([]);
  });

  it('parses a valid notifications section', () => {
    dir = mkTmpProject({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team-slack',
            kind: 'slack',
            events: ['maintenance.*'],
            wrap_response: true,
            config: { webhookUrlEnv: 'HARNESS_SLACK_WEBHOOK_URL' },
          },
        ],
      },
    });
    const r = loadNotificationsConfig(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sinks).toHaveLength(1);
      expect(r.value.sinks[0]!.id).toBe('team-slack');
      expect(r.value.sinks[0]!.wrap_response).toBe(true);
    }
  });

  it('returns Err with operator-friendly path on schema failure', () => {
    dir = mkTmpProject({
      version: 1,
      notifications: {
        sinks: [{ id: 'BadID', kind: 'slack', events: ['x'] }],
      },
    });
    const r = loadNotificationsConfig(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('notifications.sinks.0.id');
    }
  });

  it('returns Err on malformed JSON', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-cfg-bad-'));
    fs.writeFileSync(path.join(dir, 'harness.config.json'), 'not json');
    const r = loadNotificationsConfig(dir);
    expect(r.ok).toBe(false);
  });
});
