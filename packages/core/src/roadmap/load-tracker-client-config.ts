import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { TrackerClientConfig } from './tracker/factory';
import { getTrackerKindRegistration, listRegisteredTrackerKinds } from './tracker/registry';
import { deriveRepoFromGitRemote } from './derive-repo';

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
      roadmap?: { tracker?: { kind?: string; repo?: string } & Record<string, unknown> };
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
      // Tracker-kind registry (docs/changes/waypoint-tracker-kind-pnyon):
      // registered non-github kinds (builtin: 'pnyon') load through their
      // registration's own config validator. Unregistered kinds are still
      // rejected — with the registered kinds listed. The github path below
      // is unchanged.
      const registration = getTrackerKindRegistration(tracker.kind ?? '');
      if (!registration) {
        const registered = ['github', ...listRegisteredTrackerKinds()].join(', ');
        return Err(
          new Error(
            `file-less tracker only supports kind: "github" or a registered ` +
              `kind (registered: ${registered}); got "${tracker.kind}"`
          )
        );
      }
      const loaded = registration.loadProjectConfig(tracker, projectRoot);
      if (!loaded.ok) return loaded;
      // Builtin registrations return members of the TrackerClientConfig
      // union; third-party kinds extend it structurally by design.
      return Ok(loaded.value as TrackerClientConfig);
    }
    // When repo is unset, derive it from `git remote get-url origin` so
    // downstream repos that omit the key (or copy a config template) get a
    // working default instead of a no-op. Explicit config always wins (#902).
    //
    // REV-P5-S4: still refuse to silently coerce a missing repo to ''. An
    // empty repo string downstream becomes a `o/r` of `''`, producing 404s on
    // the first API call and burying the operator's actual misconfiguration.
    // Fail fast with a precise error pointing at the missing config key.
    const repo = tracker.repo || deriveRepoFromGitRemote(projectRoot);
    if (!repo) {
      return Err(
        new Error(
          'roadmap.tracker.repo is required for file-less mode (set it in ' +
            'harness.config.json, or add a git "origin" remote to derive it from)'
        )
      );
    }
    return Ok({ kind: 'github-issues', repo });
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
}
