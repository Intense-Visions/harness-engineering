/**
 * Canonical quantization table shared by the VRAM and speed estimators.
 *
 * The ranker (Phases 2b–d) reads quant ids from two largely overlapping
 * vocabularies — GGUF tags (`'Q4_K_M'`, `'Q5_K_M'`, `'IQ4_XS'`, …) and MLX
 * tags (`'MLX-4bit'`, `'MLX-8bit'`) — that surface through HuggingFace
 * filenames and tags. `bits-per-weight` is the calibration constant downstream
 * math multiplies against `sizeB` to land at the weight footprint, so all three
 * consumers (`vram.ts`, `speed.ts`, future `algorithm.ts`) read the same table
 * instead of each carrying its own.
 *
 * Numbers track llama.cpp's GGUF README and Apple's MLX docs. Refresh them in
 * one place when a vendor revises a quant; the parity fixtures landing in
 * Phase 2d catch silent drift.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 2, lines 414–429)
 */

/**
 * Bits-per-weight for every quant the ranker recognises. Keys are the
 * canonical id the rest of the package emits; aliases (case variants, MLX
 * synonyms) resolve through `normalizeQuantId`.
 */
export const QUANT_BITS_PER_WEIGHT: Readonly<Record<string, number>> = {
  // Floating point — no quantization
  F32: 32,
  FP16: 16,
  BF16: 16,
  F16: 16,
  // GGUF K-quants
  Q8_0: 8.5,
  Q6_K: 6.6,
  Q5_K_M: 5.7,
  Q5_K_S: 5.5,
  Q4_K_M: 4.85,
  Q4_K_S: 4.6,
  Q4_0: 4.5,
  Q3_K_M: 3.9,
  Q3_K_S: 3.5,
  Q2_K: 3.35,
  // GGUF importance-quants
  IQ4_XS: 4.25,
  IQ3_M: 3.7,
  // MLX
  'MLX-4bit': 4.25,
  'MLX-8bit': 8.5,
};

/**
 * Fallback used when `normalizeQuantId` does not recognise the input. Sized
 * for Q8 so the ranker's VRAM estimate biases conservatively (over-reports
 * footprint) rather than recommending a model that won't fit.
 */
export const UNKNOWN_QUANT_BITS_PER_WEIGHT = 8;

/** Result of `normalizeQuantId`. `known: false` signals the caller should attach a warning. */
export interface NormalizedQuant {
  /** Canonical key from `QUANT_BITS_PER_WEIGHT`, or the original input verbatim when unknown. */
  canonical: string;
  /** True only when the input mapped to a registered key (directly or via an alias). */
  known: boolean;
  /** Bits-per-weight for the matched key, or `UNKNOWN_QUANT_BITS_PER_WEIGHT` when unknown. */
  bitsPerWeight: number;
}

/**
 * Aliases for inputs the HF ecosystem actually emits. Lowercased on both
 * sides; the lookup is itself case-insensitive. Whitespace is stripped before
 * matching so callers can pass tag fragments without grooming them first.
 */
const QUANT_ALIASES: Readonly<Record<string, string>> = {
  // MLX synonyms
  'mlx-q4': 'MLX-4bit',
  'mlx-q8': 'MLX-8bit',
  'mlx-4-bit': 'MLX-4bit',
  'mlx-8-bit': 'MLX-8bit',
  // Common shorthand
  fp16: 'FP16',
  bf16: 'BF16',
  f16: 'F16',
  f32: 'F32',
  q8: 'Q8_0',
  q4: 'Q4_K_M',
  q5: 'Q5_K_M',
  q6: 'Q6_K',
  q3: 'Q3_K_M',
  q2: 'Q2_K',
};

/** Build a lowercased key → canonical lookup once at module load. */
const CANONICAL_BY_LOWER = buildCanonicalLookup();

function buildCanonicalLookup(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(QUANT_BITS_PER_WEIGHT)) {
    map.set(key.toLowerCase(), key);
  }
  for (const [alias, canonical] of Object.entries(QUANT_ALIASES)) {
    if (!map.has(alias.toLowerCase())) map.set(alias.toLowerCase(), canonical);
  }
  return map;
}

/**
 * Resolve a user-supplied quant string to its canonical entry. Case
 * insensitive; trims whitespace; honours documented aliases. Unrecognised
 * inputs return `known: false` with the conservative `UNKNOWN_QUANT_BITS_PER_WEIGHT`
 * so the ranker can flag the result instead of crashing on a stray tag.
 */
export function normalizeQuantId(value: string): NormalizedQuant {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { canonical: value, known: false, bitsPerWeight: UNKNOWN_QUANT_BITS_PER_WEIGHT };
  }
  const lower = trimmed.toLowerCase();
  const canonical = CANONICAL_BY_LOWER.get(lower);
  if (canonical !== undefined) {
    const bits = QUANT_BITS_PER_WEIGHT[canonical] ?? UNKNOWN_QUANT_BITS_PER_WEIGHT;
    return { canonical, known: true, bitsPerWeight: bits };
  }
  return { canonical: trimmed, known: false, bitsPerWeight: UNKNOWN_QUANT_BITS_PER_WEIGHT };
}
