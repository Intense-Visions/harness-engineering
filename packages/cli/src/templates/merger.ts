function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Array keys that ACCUMULATE across template layers instead of being replaced.
 *
 * `entryPoints` (under `entropy` / `performance`) names the files a layer
 * ships that are loaded by convention rather than imported — `src/index.ts`
 * from a level, `vite.config.ts` and `src/main.tsx` from a framework overlay.
 * Each layer declares only the files IT renders; a replace-merge would make a
 * framework overlay silently drop the level's entries (or force every overlay
 * to hardcode files from every level it might be rendered over), and an
 * explicit list disables auto-detection, so a dropped entry becomes a
 * dead-code false positive (#2630).
 */
const UNION_ARRAY_KEYS = new Set(['entryPoints']);

function unionArrays(base: unknown[], overlay: unknown[]): unknown[] {
  const out = [...base];
  for (const item of overlay) if (!out.includes(item)) out.push(item);
  return out;
}

export function deepMergeJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = result[key];
    const overlayVal = overlay[key];
    if (UNION_ARRAY_KEYS.has(key) && Array.isArray(baseVal) && Array.isArray(overlayVal)) {
      result[key] = unionArrays(baseVal, overlayVal);
    } else if (isPlainObject(baseVal) && isPlainObject(overlayVal)) {
      result[key] = deepMergeJson(baseVal, overlayVal);
    } else {
      result[key] = overlayVal;
    }
  }
  return result;
}

const CONCAT_KEYS = new Set(['dependencies', 'devDependencies', 'peerDependencies']);

export function mergePackageJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    if (CONCAT_KEYS.has(key) && isPlainObject(result[key]) && isPlainObject(overlay[key])) {
      result[key] = {
        ...(result[key] as Record<string, unknown>),
        ...(overlay[key] as Record<string, unknown>),
      };
    } else if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
      result[key] = deepMergeJson(
        result[key] as Record<string, unknown>,
        overlay[key] as Record<string, unknown>
      );
    } else {
      result[key] = overlay[key];
    }
  }
  return result;
}
