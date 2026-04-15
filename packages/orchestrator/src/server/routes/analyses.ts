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
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      });
    return true;
  }

  // GET /api/analyses/:issueId
  const match = url?.match(/^\/api\/analyses\/([^/]+)$/);
  if (match) {
    const issueId = decodeURIComponent(match[1]!);
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
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      });
    return true;
  }

  return false;
}
