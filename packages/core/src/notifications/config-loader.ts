import * as fs from 'node:fs';
import * as path from 'node:path';
import { NotificationsConfigSchema, type NotificationsConfig } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/**
 * Result wrapper around the parsed `notifications` section of
 * `harness.config.json`. Returns Ok with an empty `sinks: []` if the
 * section is absent — allows incremental adoption.
 *
 * Hermes Phase 3 spec D4: sink config lives in harness.config.json, not
 * a separate file, because sinks do not have per-record secrets at rest
 * (the secret is the env-var, resolved at runtime).
 */
export function loadNotificationsConfig(projectRoot: string): Result<NotificationsConfig, Error> {
  const configPath = path.join(projectRoot, 'harness.config.json');
  if (!fs.existsSync(configPath)) {
    return Ok({ sinks: [] });
  }
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
  let parsed: { notifications?: unknown };
  try {
    parsed = JSON.parse(raw) as { notifications?: unknown };
  } catch (err) {
    return Err(
      new Error(
        `Failed to parse harness.config.json: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
  if (parsed.notifications === undefined) {
    return Ok({ sinks: [] });
  }
  const result = NotificationsConfigSchema.safeParse(parsed.notifications);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - notifications.${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return Err(new Error(`Invalid notifications config:\n${issues}`));
  }
  return Ok(result.data);
}
