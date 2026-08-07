import { z } from 'zod';

/**
 * The reference files whose content composes a golden-build fingerprint by
 * default. Chosen so a golden snapshot is a *composite above* the per-metric
 * baselines rather than a duplicate of them:
 *
 *   - the three metric-baseline files — a change to any one moves the golden
 *     fingerprint, so `verify` catches a baseline rewrite the same way it
 *     catches a source change;
 *   - dependency + config identity anchors (lockfile, package manifest,
 *     harness config) — the "is this still the same build we trust" half that
 *     no metric baseline captures.
 *
 * Paths are project-root-relative. Any that do not exist at promote time are
 * simply omitted from the snapshot (an adopter project may not have all of
 * them); absence is not an error.
 */
export const DEFAULT_GOLDEN_REFERENCE_PATHS: readonly string[] = [
  '.harness/arch/baselines.json',
  'coverage-baselines.json',
  'benchmark-baselines.json',
  'harness.config.json',
  'package.json',
  'pnpm-lock.yaml',
];

/** Where the golden manifest lives, project-root-relative. */
export const DEFAULT_GOLDEN_MANIFEST_PATH = '.harness/golden/manifest.json';

// --- Config ---

export const GoldenConfigSchema = z.object({
  /** Enable the golden-build primitive (commands still run when false, but callers can gate on this). */
  enabled: z.boolean().default(true),
  /** Where the golden manifest is stored, project-root-relative. */
  manifestPath: z.string().default(DEFAULT_GOLDEN_MANIFEST_PATH),
  /**
   * Project-root-relative files that compose the reference-state fingerprint.
   * Defaults to {@link DEFAULT_GOLDEN_REFERENCE_PATHS}.
   */
  referencePaths: z.array(z.string()).default([...DEFAULT_GOLDEN_REFERENCE_PATHS]),
});

export type GoldenConfig = z.infer<typeof GoldenConfigSchema>;

// --- Snapshot ---

/** One reference file and the SHA-256 of its bytes at promote time. */
export const GoldenFileEntrySchema = z.object({
  path: z.string(),
  sha256: z.string(),
});

export type GoldenFileEntry = z.infer<typeof GoldenFileEntrySchema>;

/**
 * A golden build — the canonical known-good reference state.
 *
 * `files` is the fingerprint and the ONLY field `verify`/`diff` compare.
 * `promotedAt`, `commit`, and `branch` are informational provenance: they are
 * ignored by comparison and are only refreshed on a re-promote whose
 * fingerprint actually changed, so a no-op re-promote produces a byte-identical
 * manifest (no spurious diff/merge-conflict churn on the committed file — the
 * lesson carried over from the arch-baseline fix).
 */
export const GoldenSnapshotSchema = z.object({
  version: z.literal(1),
  /** ISO 8601. Informational; ignored by verify. */
  promotedAt: z.string().datetime(),
  /** Commit the golden was promoted from. Informational; ignored by verify. */
  commit: z.string(),
  /** Branch the golden was promoted from. Informational; ignored by verify. */
  branch: z.string(),
  /** Sorted-by-path fingerprint of the reference files. The comparison surface. */
  files: z.array(GoldenFileEntrySchema),
});

export type GoldenSnapshot = z.infer<typeof GoldenSnapshotSchema>;

// --- Diff ---

export const GoldenFileChangeSchema = z.object({
  path: z.string(),
  status: z.enum(['changed', 'missing', 'added']),
  /** Hash recorded in the golden (absent for `added`). */
  goldenHash: z.string().optional(),
  /** Hash of the current working-tree file (absent for `missing`). */
  currentHash: z.string().optional(),
});

export type GoldenFileChange = z.infer<typeof GoldenFileChangeSchema>;

/**
 * Result of comparing the current working tree against a golden.
 * `clean` is true iff the current fingerprint equals the golden fingerprint
 * exactly (no changed, missing, or added reference files).
 */
export const GoldenDiffResultSchema = z.object({
  clean: z.boolean(),
  /** In both, but the content differs. */
  changed: z.array(GoldenFileChangeSchema),
  /** In the golden, but absent from the working tree (deleted). */
  missing: z.array(GoldenFileChangeSchema),
  /** Present now (a configured reference file) but not in the golden (added since promote). */
  added: z.array(GoldenFileChangeSchema),
});

export type GoldenDiffResult = z.infer<typeof GoldenDiffResultSchema>;
