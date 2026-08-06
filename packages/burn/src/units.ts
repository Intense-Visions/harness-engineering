/**
 * Opus-like price ratios, normalised to input=1.
 *
 * Cache reads dominate raw token counts but are nearly free, which is why raw
 * tokens make a misleading headline and this weighting exists at all.
 */
export const W_OUT = 5.0;
export const W_IN = 1.0;
export const W_CACHE_WRITE = 1.25;
export const W_CACHE_READ = 0.1;

export function units(out: number, inp: number, cacheWrite: number, cacheRead: number): number {
  return out * W_OUT + inp * W_IN + cacheWrite * W_CACHE_WRITE + cacheRead * W_CACHE_READ;
}

/** Compact unit rendering shared by the report, the hooks and the statusline. */
export function human(u: number | null | undefined): string {
  const v = Number(u ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return `${Math.round(v)}`;
}
