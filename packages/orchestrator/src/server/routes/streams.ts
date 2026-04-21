import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StreamRecorder } from '../../core/stream-recorder';

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function ndjsonResponse(res: ServerResponse, content: string): void {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  res.end(content);
}

/** Only allow safe path segments — strict allowlist, no traversal. */
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9_-]{1,128}$/;
function isSafeSegment(segment: string): boolean {
  return SAFE_SEGMENT_RE.test(segment);
}

const API_PREFIX = '/api/streams';

/**
 * Parse the URL to extract issueId and optional tail (attempt or "manifest").
 * Pattern: /api/streams/:issueId[/:tail]
 */
function parseStreamUrl(url: string): { issueId: string; tail: string | null } | null {
  const parsed = new URL(url, 'http://localhost');
  const segments = parsed.pathname.slice(API_PREFIX.length).split('/').filter(Boolean);

  if (segments.length === 0) return null;
  const issueId = segments[0]!;
  const tail = segments[1] ?? null;
  return { issueId, tail };
}

function handleGetManifest(res: ServerResponse, recorder: StreamRecorder, issueId: string): void {
  const manifest = recorder.getManifest(issueId);
  if (!manifest) {
    jsonResponse(res, 404, { error: 'Stream not found' });
    return;
  }
  jsonResponse(res, 200, manifest);
}

function handleGetStream(
  res: ServerResponse,
  recorder: StreamRecorder,
  issueId: string,
  attempt?: number
): void {
  const content = recorder.getStream(issueId, attempt);
  if (!content) {
    jsonResponse(res, 404, { error: 'Stream not found' });
    return;
  }
  ndjsonResponse(res, content);
}

export function handleStreamsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  recorder: StreamRecorder
): boolean {
  const { method, url } = req;
  if (!url?.startsWith(API_PREFIX)) return false;
  if (method !== 'GET') return false;

  const parsed = parseStreamUrl(url);
  if (!parsed) {
    // GET /api/streams with no issueId — list all sessions
    jsonResponse(res, 200, recorder.listSessions());
    return true;
  }

  if (!isSafeSegment(parsed.issueId)) {
    jsonResponse(res, 400, { error: 'Invalid issueId' });
    return true;
  }

  if (parsed.tail === 'manifest') {
    handleGetManifest(res, recorder, parsed.issueId);
    return true;
  }

  if (parsed.tail != null) {
    if (!isSafeSegment(parsed.tail)) {
      jsonResponse(res, 400, { error: 'Invalid attempt' });
      return true;
    }
    const attempt = parseInt(parsed.tail, 10);
    if (isNaN(attempt) || attempt < 1) {
      jsonResponse(res, 400, { error: 'Invalid attempt number' });
      return true;
    }
    handleGetStream(res, recorder, parsed.issueId, attempt);
    return true;
  }

  // No tail — return latest attempt
  handleGetStream(res, recorder, parsed.issueId);
  return true;
}
