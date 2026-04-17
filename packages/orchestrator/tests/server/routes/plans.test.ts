import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePlansRoute } from '../../../src/server/routes/plans';

function createServer(plansDir: string): http.Server {
  return http.createServer((req, res) => {
    if (!handlePlansRoute(req, res, plansDir)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('plans routes', () => {
  let tmpDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plans-route-test-'));
    port = Math.floor(Math.random() * 10000) + 31000;
    server = createServer(tmpDir);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/plans writes a plan file and returns 201', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: '2026-04-14-test-plan.md',
      content: '# Test Plan\n\nContent here.',
    });
    expect(res.statusCode).toBe(201);

    const filePath = path.join(tmpDir, '2026-04-14-test-plan.md');
    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toBe('# Test Plan\n\nContent here.');
  });

  it('POST /api/plans returns 400 when filename is missing', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      content: 'no filename',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans returns 400 when content is missing', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: 'test.md',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans rejects path traversal in filename', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: '../../../etc/passwd',
      content: 'malicious',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans rejects non-.md filenames', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: 'script.sh',
      content: 'malicious',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns false for non-matching routes', async () => {
    const res = await request(port, 'GET', '/api/other');
    expect(res.statusCode).toBe(404);
  });
});
