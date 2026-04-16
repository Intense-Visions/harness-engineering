import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnalysisArchive } from '../../core/analysis-archive';

/**
 * Handles GET /api/analyses — returns all archived analysis records.
 * Handles GET /api/analyses/:issueId — returns a single analysis record.
 *
 * Returns true if the request was handled, false otherwise.
 */
export function handleAnalysesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  archive: AnalysisArchive | undefined
): boolean {
  if (!archive) return false;

  const { method, url } = req;
  if (method !== 'GET') return false;

  // GET /api/analyses
  if (url === '/api/analyses') {
    archive
      .list()
      .then((records) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(records));
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list analyses' }));
      });
    return true;
  }

  // GET /api/analyses/:issueId
  const match = url?.match(/^\/api\/analyses\/([^/]+)$/);
  if (match) {
    const issueId = decodeURIComponent(match[1]!);
    if (issueId.includes('..') || issueId.includes('/') || issueId.includes('\\')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid issueId' }));
      return true;
    }
    archive
      .get(issueId)
      .then((record) => {
        if (!record) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to retrieve analysis' }));
      });
    return true;
  }

  return false;
}
