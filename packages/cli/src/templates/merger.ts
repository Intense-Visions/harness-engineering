function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMergeJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
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
