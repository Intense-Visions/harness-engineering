import { Request, Response } from 'express';

interface AuthConfig {
  secret: string;
  expiresIn: number;
}

export class AuthMiddleware {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async authenticate(req: Request): Promise<{ id: string; name: string }> {
    const token = req.headers.authorization;
    if (!token) throw new Error('No token');
    return { id: '1', name: 'test' };
  }

  refreshToken(token: string): string {
    return token + '-refreshed';
  }

  private validateJWT(jwt: string): boolean {
    return jwt.length > 0;
  }
}

export function createAuthMiddleware(config: AuthConfig): AuthMiddleware {
  return new AuthMiddleware(config);
}

export type UserRole = 'admin' | 'user' | 'guest';

export const DEFAULT_CONFIG: AuthConfig = { secret: 'dev', expiresIn: 3600 };
