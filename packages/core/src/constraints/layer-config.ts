import * as path from 'node:path';
import { defineLayer } from './layers';
import type { Layer, LayerConfig } from './types';
import type { LanguageParser } from '../shared/parsers';

/** What layer validation does when its engine cannot run (#2098). */
export type DepsFallbackBehavior = 'skip' | 'warn' | 'error';

/**
 * Dependency-validation settings read from `harness.config.json`, in one place.
 *
 * `harness check-deps` and the `harness ci check` deps step used to build their
 * `LayerConfig` separately, and only `check-deps` honoured `deps.exclude`,
 * `deps.fallbackBehavior`, `deps.resolveWorkspacePackages` and `rootDir`, so the
 * same repo could be clean under one and dirty under the other (#2606). Both
 * now read the config through `resolveDepsSettings`.
 */
export interface DepsSettings {
  /** Configured layers, empty when none are configured. */
  layers: Layer[];
  /** Absolute root that layer patterns resolve against: `<projectRoot>/<rootDir>`. */
  rootDir: string;
  /** `deps.exclude`: globs stacked on core's default discovery ignores. */
  exclude: string[];
  /** `deps.fallbackBehavior`, defaulting to `skip` (abstain, never pass). */
  fallbackBehavior: DepsFallbackBehavior;
  /** `deps.resolveWorkspacePackages` (#2216), defaulting to `false`. */
  resolveWorkspacePackages: boolean;
}

const FALLBACK_BEHAVIORS: readonly DepsFallbackBehavior[] = ['skip', 'warn', 'error'];

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toLayer(raw: Record<string, unknown>): Layer {
  // `pattern` is the schema's field; `patterns` is accepted for configs that
  // list several globs for one layer.
  const patterns = Array.isArray(raw.patterns)
    ? stringList(raw.patterns)
    : typeof raw.pattern === 'string'
      ? [raw.pattern]
      : [];
  return defineLayer(String(raw.name), patterns, stringList(raw.allowedDependencies));
}

/**
 * Read the dependency-validation settings out of a `harness.config.json` object.
 *
 * Accepts the raw JSON or the schema-parsed config: every field is read
 * defensively and falls back to the schema default.
 *
 * @param config - The project's harness config.
 * @param projectRoot - Directory that owns the config; `rootDir` resolves against it.
 */
export function resolveDepsSettings(config: object, projectRoot: string): DepsSettings {
  const cfg = config as Record<string, unknown>;
  const deps = (cfg.deps ?? {}) as Record<string, unknown>;
  const rawLayers = Array.isArray(cfg.layers) ? (cfg.layers as Record<string, unknown>[]) : [];
  const fallback = deps.fallbackBehavior as DepsFallbackBehavior | undefined;
  return {
    layers: rawLayers.map(toLayer),
    rootDir: path.resolve(projectRoot, typeof cfg.rootDir === 'string' ? cfg.rootDir : '.'),
    exclude: stringList(deps.exclude),
    fallbackBehavior: fallback && FALLBACK_BEHAVIORS.includes(fallback) ? fallback : 'skip',
    resolveWorkspacePackages: deps.resolveWorkspacePackages === true,
  };
}

/** Build the `validateDependencies` input from resolved settings. */
export function toLayerConfig(settings: DepsSettings, parser: LanguageParser): LayerConfig {
  return {
    layers: settings.layers,
    rootDir: settings.rootDir,
    parser,
    fallbackBehavior: settings.fallbackBehavior,
    extraIgnore: settings.exclude,
    resolveWorkspacePackages: settings.resolveWorkspacePackages,
  };
}
