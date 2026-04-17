import type { User, AuthToken } from '../types';
import { hashPassword } from '../utils/hash';

export class AuthService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  authenticate(username: string, password: string): AuthToken {
    const hashed = hashPassword(password);
    return { token: hashed, user: username };
  }
}

export const MAX_SESSIONS = 100;
