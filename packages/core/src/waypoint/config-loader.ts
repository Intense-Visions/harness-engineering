import * as fs from 'node:fs';
import * as path from 'node:path';
import { WaypointConfigSchema, type WaypointConfig } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/**
 * Result wrapper around the parsed `waypoint` section of
 * `harness.config.json` (same pattern as `loadNotificationsConfig`).
 *
 * Returns Ok with `{}` (no sink → emission disabled) when the config file or
 * the `waypoint` key is absent — the non-adopter invariance contract (PRD
 * Story 1): a repo that never opted in never grows Waypoint behavior.
 */
export function loadWaypointConfig(projectRoot: string): Result<WaypointConfig, Error> {
  const configPath = path.join(projectRoot, 'harness.config.json');
  if (!fs.existsSync(configPath)) {
    return Ok({});
  }
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
  let parsed: { waypoint?: unknown };
  try {
    parsed = JSON.parse(raw) as { waypoint?: unknown };
  } catch (err) {
    return Err(
      new Error(
        `Failed to parse harness.config.json: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
  if (parsed.waypoint === undefined) {
    return Ok({});
  }
  const result = WaypointConfigSchema.safeParse(parsed.waypoint);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - waypoint.${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return Err(new Error(`Invalid waypoint config:\n${issues}`));
  }
  return Ok(result.data);
}
