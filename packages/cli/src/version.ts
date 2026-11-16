import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

let resolved: string;
try {
  resolved = (require_('../package.json') as { version?: string }).version ?? '0.0.0';
} catch {
  resolved = '0.0.0';
}

/**
 * The current version of the Harness CLI, read from package.json at runtime.
 */
export const CLI_VERSION: string = resolved;

/**
 * Injected by tsup's `define` at build time (see tsup.config.ts). The
 * published CLI does not depend on `@harness-engineering/eslint-plugin`, so its
 * version cannot be resolved at runtime from an installed CLI; it is embedded
 * as a literal instead. Undefined when running from source (tests), where the
 * workspace sibling's package.json is read.
 */
declare const __HARNESS_ESLINT_PLUGIN_VERSION__: string | undefined;

function readWorkspaceEslintPluginVersion(): string {
  try {
    const pkg = require_('../../eslint-plugin/package.json') as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fall through
  }
  throw new Error(
    'Cannot determine the @harness-engineering/eslint-plugin version: the CLI was ' +
      'built without __HARNESS_ESLINT_PLUGIN_VERSION__ and packages/eslint-plugin is not beside it'
  );
}

/**
 * The `@harness-engineering/eslint-plugin` version scaffolded package.json files
 * pin (`^{{eslintPluginVersion}}`, #2630). Resolved lazily so a missing value
 * only fails a scaffold that needs it.
 */
export function eslintPluginVersion(): string {
  return typeof __HARNESS_ESLINT_PLUGIN_VERSION__ === 'string'
    ? __HARNESS_ESLINT_PLUGIN_VERSION__
    : readWorkspaceEslintPluginVersion();
}
