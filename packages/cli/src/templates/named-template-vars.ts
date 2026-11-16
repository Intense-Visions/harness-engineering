import { RUNNER_PRESETS, CI_ASSESSMENTS } from '@harness-engineering/core';

/**
 * Variables the opt-in CI templates (`ci-required-review`, `ci-pre-merge-brief`)
 * reference. The template engine compiles Handlebars in strict mode, so every
 * caller that renders a template must supply them — templates that don't
 * reference them simply ignore them.
 *
 * Single source of truth for both `harness init` (CLI) and the `init_project`
 * MCP tool, so the two entry points can't drift (#2630).
 */
export interface NamedTemplateVars {
  /** `harness review-ci --runner` the rendered workflow invokes. */
  runner: string;
  /** `harness review-ci --block-on` level the rendered workflow uses. */
  blockOn: string;
  /** Branch the rendered workflow triggers on (`pull_request.branches`). */
  baseBranch: string;
}

export const NAMED_TEMPLATE_DEFAULTS: Readonly<NamedTemplateVars> = Object.freeze({
  runner: 'claude',
  blockOn: 'request-changes',
  baseBranch: 'main',
});

/** Runner ids the rendered workflow may pass to `harness review-ci --runner`. */
export const NAMED_TEMPLATE_RUNNERS: readonly string[] = Object.keys(RUNNER_PRESETS);

/** Levels the rendered workflow may pass to `harness review-ci --block-on`. */
export const NAMED_TEMPLATE_BLOCK_ON: readonly string[] = [...CI_ASSESSMENTS, 'none'];

/**
 * Merge caller overrides over the shared defaults. `undefined` overrides are
 * ignored, so an omitted option always falls back to the default.
 */
export function resolveNamedTemplateVars(
  overrides: Partial<Record<keyof NamedTemplateVars, string | undefined>> = {}
): NamedTemplateVars {
  return {
    runner: overrides.runner ?? NAMED_TEMPLATE_DEFAULTS.runner,
    blockOn: overrides.blockOn ?? NAMED_TEMPLATE_DEFAULTS.blockOn,
    baseBranch: overrides.baseBranch ?? NAMED_TEMPLATE_DEFAULTS.baseBranch,
  };
}

/**
 * Validate resolved vars against the values `harness review-ci` accepts and a
 * safe branch-name shape (the value is interpolated into workflow YAML).
 * Returns an error message, or null when valid.
 */
export function validateNamedTemplateVars(vars: NamedTemplateVars): string | null {
  if (!NAMED_TEMPLATE_RUNNERS.includes(vars.runner)) {
    return `Unknown runner "${vars.runner}". Expected one of: ${NAMED_TEMPLATE_RUNNERS.join(', ')}.`;
  }
  if (!NAMED_TEMPLATE_BLOCK_ON.includes(vars.blockOn)) {
    return `Unknown blockOn "${vars.blockOn}". Expected one of: ${NAMED_TEMPLATE_BLOCK_ON.join(', ')}.`;
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(vars.baseBranch)) {
    return `Invalid baseBranch "${vars.baseBranch}". Use a plain branch name (letters, digits, . _ / -).`;
  }
  return null;
}
