import { describe, it, expect } from 'vitest';
import { tenantContextMiddleware } from '../../src/middleware/tenant-context';

function mockReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

describe('tenantContextMiddleware', () => {
  it('rejects requests without X-Tenant-ID', () => {
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(mockReq(), res, () => { nextCalled = true; });
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('rejects empty X-Tenant-ID', () => {
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(mockReq({ 'x-tenant-id': '  ' }), res, () => { nextCalled = true; });
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('attaches tenant context for valid header', () => {
    const req = mockReq({ 'x-tenant-id': 'tenant-1' });
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.tenant?.tenantId).toBe('tenant-1');
  });
});
