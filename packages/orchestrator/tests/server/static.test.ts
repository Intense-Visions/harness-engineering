import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleStaticFile } from '../../src/server/static';

function createServer(dashboardDir: string): http.Server {
  return http.createServer((req, res) => {
    if (!handleStaticFile(req, res, dashboardDir)) {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

function get(
  port: number,
  urlPath: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 500, headers: res.headers, body: data });
        });
      })
      .on('error', reject);
  });
}

describe('static file serving', () => {
  let tmpDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'static-test-'));
    port = Math.floor(Math.random() * 10000) + 33000;

    // Create mock dashboard files
    await fs.writeFile(path.join(tmpDir, 'index.html'), '<html>Dashboard</html>');
    await fs.mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'assets', 'app.js'), 'console.log("app")');
    await fs.writeFile(path.join(tmpDir, 'assets', 'style.css'), 'body {}');

    server = createServer(tmpDir);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('serves index.html for root path', async () => {
    const res = await get(port, '/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Dashboard');
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('serves static files with correct MIME types', async () => {
    const js = await get(port, '/assets/app.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');

    const css = await get(port, '/assets/style.css');
    expect(css.statusCode).toBe(200);
    expect(css.headers['content-type']).toContain('css');
  });

  it('SPA fallback: returns index.html for unknown non-API paths', async () => {
    const res = await get(port, '/some/deep/route');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Dashboard');
  });

  it('does not handle API paths', async () => {
    const res = await get(port, '/api/v1/state');
    expect(res.statusCode).toBe(404);
  });

  it('rejects path traversal attempts', async () => {
    const res = await get(port, '/../../../etc/passwd');
    expect(res.statusCode).toBe(200); // Falls through to SPA fallback with index.html
    expect(res.body).toContain('Dashboard');
  });
});
