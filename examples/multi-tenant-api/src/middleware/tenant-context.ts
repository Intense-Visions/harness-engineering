import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../types/tenant';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

/**
 * Extract tenant context from X-Tenant-ID header.
 * Rejects requests without a valid tenant ID.
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    res.status(401).json({ error: 'X-Tenant-ID header is required' });
    return;
  }

  req.tenant = { tenantId: tenantId.trim() };
  next();
}
