// packages/core/src/state/spill.ts
//
// Spill-to-disk for large tool output (issue #1398).
//
// Long-running sessions — fleet workers, autopilot loops — accumulate large
// intermediate tool output: full test logs, whole diffs, grep/glob overflow.
// Inlining all of it blows the context budget; truncating it ad hoc loses the
// tail with no recovery path.
//
// This module offloads output over a configurable size threshold to a file
// under the session/state area (`.harness/.../spill/`) and returns a stable,
// followup-READABLE locator. A later turn can recover the full content via
// `readSpill`, or search it via `searchSpill`, instead of losing it. Content
// under the threshold passes through inline, unchanged.
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { getStateDir } from './state-shared';

/** Directory (under the resolved state dir) where spilled payloads are written. */
export const SPILL_DIR = 'spill';

/**
 * Default byte threshold above which output is spilled to disk. ~30 KB is large
 * enough that ordinary tool output passes through inline, but small enough that
 * a full test log / diff / grep overflow is captured before it dominates the
 * context budget.
 */
export const DEFAULT_SPILL_THRESHOLD_BYTES = 30_000;

/** Environment variable that overrides the default spill threshold (bytes). */
export const SPILL_THRESHOLD_ENV = 'HARNESS_SPILL_THRESHOLD_BYTES';

/** Scheme prefix that marks a string as a spill locator. */
export const SPILL_LOCATOR_SCHEME = 'harness-spill:';

/** Default number of leading characters retained as an inline preview. */
const DEFAULT_PREVIEW_CHARS = 2000;

export interface SpillOptions {
  /**
   * Byte threshold above which content is spilled. When omitted, resolved from
   * the {@link SPILL_THRESHOLD_ENV} env var, then {@link DEFAULT_SPILL_THRESHOLD_BYTES}.
   */
  thresholdBytes?: number;
  /** Session slug — scopes the spill dir to a session's state area. */
  session?: string;
  /** Stream name — scopes the spill dir to a stream's state area. */
  stream?: string;
  /** Short human label recorded in the filename + notice (e.g. `test-log`). */
  label?: string;
  /** Leading characters kept as an inline preview. Defaults to 2000. */
  previewChars?: number;
}

/** Content stayed under the threshold and was returned inline, unchanged. */
export interface SpillPassthrough {
  spilled: false;
  content: string;
  bytes: number;
}

/** Content exceeded the threshold and was written to disk. */
export interface SpillWritten {
  spilled: true;
  /** Stable, followup-readable locator: scheme + repo-relative path. */
  locator: string;
  /** Absolute path to the spilled file — directly cat/grep-able. */
  path: string;
  /** Total bytes written. */
  bytes: number;
  /** Leading slice of the content, for inline context. */
  preview: string;
  /** Ready-to-inline replacement: preview + a recovery notice with the locator. */
  notice: string;
}

export type SpillResult = SpillPassthrough | SpillWritten;

/** A single line matched by {@link searchSpill}. */
export interface SpillSearchMatch {
  /** 1-based line number within the spilled file. */
  line: number;
  /** The full matching line (without trailing newline). */
  text: string;
}

export interface SpillSearchResult {
  locator: string;
  matches: SpillSearchMatch[];
  /** True when the number of matches hit the requested cap. */
  truncated: boolean;
}

/**
 * Resolves the effective spill threshold (bytes).
 *
 * Precedence: explicit argument → {@link SPILL_THRESHOLD_ENV} → default. Invalid
 * or negative values are ignored in favour of the next source.
 */
export function resolveSpillThreshold(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const envRaw = process.env[SPILL_THRESHOLD_ENV];
  if (envRaw !== undefined) {
    const parsed = Number(envRaw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_SPILL_THRESHOLD_BYTES;
}

/** Sanitizes a caller-supplied label into a filesystem-safe token. */
function sanitizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Generates a unique, sortable spill filename. */
function generateSpillFilename(label?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(5))).toString('hex');
  const safeLabel = label ? sanitizeLabel(label) : '';
  const suffix = safeLabel ? `-${safeLabel}` : '';
  return `${timestamp}-${random}${suffix}.txt`;
}

/** Builds a locator string from a project-relative path (posix-normalized). */
function toLocator(relativePath: string): string {
  return `${SPILL_LOCATOR_SCHEME}${relativePath.replaceAll('\\', '/')}`;
}

/**
 * Resolves a spill locator (or a bare relative path) to an absolute file path
 * under `projectPath`, rejecting anything that escapes the project root.
 */
function resolveLocator(projectPath: string, locator: string): Result<string, Error> {
  const raw = locator.startsWith(SPILL_LOCATOR_SCHEME)
    ? locator.slice(SPILL_LOCATOR_SCHEME.length)
    : locator;

  if (!raw || raw.trim() === '') {
    return Err(new Error('Spill locator must not be empty'));
  }
  if (path.isAbsolute(raw)) {
    return Err(new Error(`Invalid spill locator '${locator}': must be project-relative`));
  }

  const absolute = path.resolve(projectPath, raw);
  const root = path.resolve(projectPath);
  // Containment check without path.relative: the resolved path must be the root
  // itself or sit beneath `root + separator`.
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return Err(new Error(`Invalid spill locator '${locator}': escapes the project root`));
  }
  return Ok(absolute);
}

/** Builds the inline recovery notice shown in place of the full payload. */
function buildNotice(bytes: number, locator: string, preview: string): string {
  const header =
    `[harness spill] ${bytes} bytes of output offloaded to disk to preserve the context budget.\n` +
    `[harness spill] recover the full content via locator: ${locator}\n` +
    `--- preview (first ${preview.length} chars) ---`;
  const footer = '--- end preview (content truncated; read the locator above for the rest) ---';
  return `${header}\n${preview}\n${footer}`;
}

/**
 * Spills `content` to disk when it exceeds the resolved threshold, returning a
 * followup-readable locator; otherwise passes it through inline unchanged.
 *
 * The spilled file lives under the resolved state dir (session/stream/legacy)
 * in a `spill/` subdirectory, which sits inside `.harness/` and is therefore
 * git-ignored — spilled runtime output never lands in a commit.
 */
export async function spillIfNeeded(
  projectPath: string,
  content: string,
  options: SpillOptions = {}
): Promise<Result<SpillResult, Error>> {
  const bytes = Buffer.byteLength(content, 'utf8');
  const threshold = resolveSpillThreshold(options.thresholdBytes);

  if (bytes <= threshold) {
    return Ok({ spilled: false, content, bytes });
  }

  const dirResult = await getStateDir(projectPath, options.stream, options.session);
  if (!dirResult.ok) return dirResult;

  const spillDir = path.join(dirResult.value, SPILL_DIR);
  const filePath = path.join(spillDir, generateSpillFilename(options.label));

  try {
    fs.mkdirSync(spillDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    return Err(
      new Error(
        `Failed to spill output to disk: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  const locator = toLocator(path.relative(projectPath, filePath).replaceAll('\\', '/'));
  const previewChars = options.previewChars ?? DEFAULT_PREVIEW_CHARS;
  const preview = content.slice(0, previewChars);

  return Ok({
    spilled: true,
    locator,
    path: filePath,
    bytes,
    preview,
    notice: buildNotice(bytes, locator, preview),
  });
}

/**
 * Reads back the full content previously spilled under `locator`. Accepts both
 * a scheme-prefixed locator and a bare project-relative path.
 */
export async function readSpill(
  projectPath: string,
  locator: string
): Promise<Result<string, Error>> {
  const resolved = resolveLocator(projectPath, locator);
  if (!resolved.ok) return resolved;

  try {
    if (!fs.existsSync(resolved.value)) {
      return Err(new Error(`Spilled content not found for locator '${locator}'`));
    }
    return Ok(fs.readFileSync(resolved.value, 'utf8'));
  } catch (error) {
    return Err(
      new Error(
        `Failed to read spilled content: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Searches previously spilled content line-by-line for `pattern` (a substring
 * or RegExp), returning matching lines with 1-based line numbers. Lets a later
 * turn grep an over-threshold payload without pulling the whole thing inline.
 */
export async function searchSpill(
  projectPath: string,
  locator: string,
  pattern: string | RegExp,
  options: { maxMatches?: number } = {}
): Promise<Result<SpillSearchResult, Error>> {
  const readResult = await readSpill(projectPath, locator);
  if (!readResult.ok) return readResult;

  const maxMatches = options.maxMatches ?? 200;
  const test: (line: string) => boolean =
    pattern instanceof RegExp ? (line) => pattern.test(line) : (line) => line.includes(pattern);

  const matches: SpillSearchMatch[] = [];
  const lines = readResult.value.split('\n');
  let truncated = false;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (test(text)) {
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push({ line: i + 1, text });
    }
  }

  return Ok({ locator, matches, truncated });
}
