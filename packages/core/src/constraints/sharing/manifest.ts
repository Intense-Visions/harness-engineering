import { ManifestSchema } from './types';
import type { Manifest } from './types';

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Parse and validate a manifest from a pre-parsed object.
 *
 * YAML parsing is the caller's responsibility (stays in the CLI layer).
 * This function validates the parsed structure against ManifestSchema.
 *
 * @param parsed - The result of YAML.parse() or JSON.parse()
 * @returns Result<Manifest, string>
 */
export function parseManifest(parsed: unknown): Result<Manifest, string> {
  const result = ManifestSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Invalid manifest: ${issues}` };
  }

  return { ok: true, value: result.data };
}
