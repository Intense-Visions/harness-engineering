import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { TrackerClientConfig } from './tracker/factory';

/**
 * Build a `TrackerClientConfig` from `<projectRoot>/harness.config.json`.
 *
 * REV-P4-5 consolidation (D-P5-G): single source of truth for the previously
 * triplicated helper in cli (`mcp/tools/roadmap.ts`), dashboard
 * (`server/routes/actions.ts`), and orchestrator
 * (`server/routes/roadmap-actions.ts`).
 *
 * Maps `roadmap.tracker.kind === 'github'` (file-backed sync engine
 * namespace) to the client-side `kind: 'github-issues'`. See
 * `packages/cli/src/config/schema.ts:265` for the long-form note on the
 * two namespaces.
 */
export function loadTrackerClientConfigFromProject(
  projectRoot: string
): Result<TrackerClientConfig, Error> {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) {
      return Err(new Error('harness.config.json not found'));
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      roadmap?: { tracker?: { kind?: string; repo?: string } };
    };
    const tracker = cfg.roadmap?.tracker;
    if (!tracker) {
      return Err(
        new Error(
          'file-less tracker config missing: set roadmap.tracker.kind in harness.config.json'
        )
      );
    }
    if (tracker.kind !== 'github') {
      return Err(
        new Error(`file-less tracker only supports kind: "github" today; got "${tracker.kind}"`)
      );
    }
    // REV-P5-S4: refuse to silently coerce a missing repo to ''. An empty repo
    // string downstream becomes a `o/r` of `''`, producing 404s on the first
    // API call and burying the operator's actual misconfiguration. Fail fast
    // with a precise error pointing at the missing config key.
    if (!tracker.repo) {
      return Err(
        new Error(
          'roadmap.tracker.repo is required for file-less mode (set it in harness.config.json)'
        )
      );
    }
    return Ok({ kind: 'github-issues', repo: tracker.repo });
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
}
