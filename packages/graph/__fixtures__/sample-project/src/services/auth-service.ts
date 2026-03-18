import type { User, AuthToken } from '../types.js';
import { hashPassword } from '../utils/hash.js';

export class AuthService {
  authenticate(user: User, password: string): AuthToken {
    const hash = hashPassword(password);
    return {
      token: hash.slice(0, 16),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }
}
