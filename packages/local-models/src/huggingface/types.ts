/**
 * HuggingFace API client — public types and decode helpers.
 *
 * Surfaces the row shape consumed downstream (ranker, scheduler, dashboard)
 * and the structured warning envelope the client emits when a fetch or
 * decode fails. The client never throws (S4); failures resolve as a
 * `HuggingFaceFetchResult` carrying warnings.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 87–88, S4)
 */

import { z } from 'zod';

/**
 * Subset of a HuggingFace `/api/models` row consumed by LMLM. Every field
 * except `id` is optional — HF returns sparse rows for some queries and we
 * tolerate drift in their schema rather than rejecting whole batches.
 */
export interface HuggingFaceModelSummary {
  /** Canonical `<org>/<name>` repo id, e.g. `"Qwen/Qwen3-32B-GGUF"`. */
  id: string;
  /** Cumulative download count. Absent on rows HF hasn't computed yet. */
  downloads?: number;
  /** Like count. */
  likes?: number;
  /** Free-form tag list (`["gguf","conversational","license:apache-2.0",...]`). */
  tags?: string[];
  /** Detected library (e.g. `"gguf"`, `"transformers"`). */
  libraryName?: string;
  /** Detected pipeline (e.g. `"text-generation"`, `"conversational"`). */
  pipelineTag?: string;
  /** ISO timestamp of the most recent commit, when HF chooses to populate it. */
  lastModified?: string;
}

/**
 * Structured warning emitted when a fetch, decode, or cache operation
 * degrades. Mirrors `HardwareDetectionWarning` for cross-module parity.
 */
export interface HuggingFaceWarning {
  /** Stable machine code (`'hf_fetch_failed'`, `'hf_decode_dropped_rows'`, ...). */
  code: string;
  /** Operator-facing one-liner. */
  message: string;
  /** Optional underlying error message — only set when an exception was caught. */
  cause?: string;
}

/** Provenance of the returned data. */
export type HuggingFaceFetchSource = 'live' | 'cache';

/**
 * Bundle returned by every `HuggingFaceClient` method. The shape stays
 * consistent so callers can pattern-match on `warnings.length` rather than
 * branching on success/failure.
 */
export interface HuggingFaceFetchResult<T> {
  value: T;
  warnings: HuggingFaceWarning[];
  source: HuggingFaceFetchSource;
}

/**
 * Options for `HuggingFaceClient.listModels`. The shape mirrors the HF API
 * query parameters we actually use; richer filters can be added when a
 * consumer needs them.
 */
export interface HuggingFaceListOptions {
  /** Filter by HF organization slug (e.g. `'Qwen'`). */
  author?: string;
  /** Free-text search against the model id. */
  search?: string;
  /** HF `filter` parameter (tag-based filter). */
  filter?: string;
  /** Comma-joined tag list. */
  tags?: string[];
  /** Rows per page. Defaults to HF's own default (currently 50) when omitted. */
  limit?: number;
  /** When `true`, follow `Link: rel="next"` cursors up to `maxPages`. */
  paginate?: boolean;
  /** Hard ceiling on pages followed when `paginate` is true. Default 5. */
  maxPages?: number;
}

/**
 * Drift-tolerant Zod schema for a single HF `/api/models` row. Unknown
 * fields are silently ignored; missing optional fields are treated as
 * `undefined`. Rows that fail decode (e.g., missing `id`) are filtered out
 * by `decodeModelSummaries` rather than rejecting the whole batch.
 */
export const HuggingFaceModelSummarySchema = z
  .object({
    id: z.string().min(1),
    downloads: z.number().int().nonnegative().optional(),
    likes: z.number().int().nonnegative().optional(),
    tags: z.array(z.string()).optional(),
    library_name: z.string().optional(),
    pipeline_tag: z.string().optional(),
    lastModified: z.string().optional(),
  })
  .transform((row): HuggingFaceModelSummary => {
    const out: HuggingFaceModelSummary = { id: row.id };
    if (row.downloads !== undefined) out.downloads = row.downloads;
    if (row.likes !== undefined) out.likes = row.likes;
    if (row.tags !== undefined) out.tags = row.tags;
    if (row.library_name !== undefined) out.libraryName = row.library_name;
    if (row.pipeline_tag !== undefined) out.pipelineTag = row.pipeline_tag;
    if (row.lastModified !== undefined) out.lastModified = row.lastModified;
    return out;
  });

/**
 * Decode a batch of unknown rows into `HuggingFaceModelSummary[]`. Rows that
 * fail the schema are dropped and the count is returned alongside the
 * survivors so the caller can decide whether to surface a warning.
 */
export function decodeModelSummaries(rows: unknown): {
  models: HuggingFaceModelSummary[];
  dropped: number;
} {
  if (!Array.isArray(rows)) {
    return { models: [], dropped: 0 };
  }
  const models: HuggingFaceModelSummary[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = HuggingFaceModelSummarySchema.safeParse(row);
    if (parsed.success) {
      models.push(parsed.data);
    } else {
      dropped += 1;
    }
  }
  return { models, dropped };
}
