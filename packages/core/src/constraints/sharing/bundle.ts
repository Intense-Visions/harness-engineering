import { BundleSchema } from './types';
import type { Manifest, Bundle, BundleConstraints } from './types';
import type { Result } from '@harness-engineering/types';

/**
 * Resolve a dot-path string against a nested object.
 *
 * Examples:
 *   "layers"           → obj.layers
 *   "security.rules"   → obj.security?.rules
 *
 * Returns undefined if any segment is missing or not an object.
 */
function resolveDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  const segments = dotPath.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Set a value at a dot-path in a nested object, creating intermediate objects as needed.
 *
 * Examples:
 *   set(obj, "layers", [...])           → obj.layers = [...]
 *   set(obj, "security.rules", {...})   → obj.security = { rules: {...} }
 */
function setDotPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  const lastSegment = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  let current: Record<string, unknown> = obj;

  for (const segment of parentSegments) {
    if (
      current[segment] === undefined ||
      current[segment] === null ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  if (lastSegment !== undefined) {
    current[lastSegment] = value;
  }
}

/**
 * Extract a constraints bundle from a harness config using the paths declared
 * in the manifest's `include` array.
 *
 * Only paths that exist in the config are included in the bundle.
 * Missing paths are silently omitted (not an error).
 *
 * Supported include paths:
 *   "layers"             → config.layers
 *   "forbiddenImports"   → config.forbiddenImports
 *   "boundaries"         → config.boundaries
 *   "architecture"       → config.architecture
 *   "security.rules"     → config.security.rules
 *
 * @param manifest - Validated Manifest object
 * @param config   - The project's harness config (Record<string, unknown>)
 * @returns Result<Bundle, string>
 */
export function extractBundle(
  manifest: Manifest,
  config: Record<string, unknown>
): Result<Bundle, string> {
  const constraints: Record<string, unknown> = {};

  for (const includePath of manifest.include) {
    const value = resolveDotPath(config, includePath);
    if (value !== undefined) {
      setDotPath(constraints, includePath, value);
    }
    // If value is undefined, silently omit (per spec)
  }

  const bundle = {
    name: manifest.name,
    version: manifest.version,
    ...(manifest.minHarnessVersion !== undefined && {
      minHarnessVersion: manifest.minHarnessVersion,
    }),
    ...(manifest.description !== undefined && {
      description: manifest.description,
    }),
    constraints: constraints as BundleConstraints,
  };

  const parsed = BundleSchema.safeParse(bundle);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Invalid bundle: ${issues}` };
  }

  return { ok: true, value: parsed.data };
}
