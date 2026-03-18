import type { User } from '../types.js';
import { AuthService } from './auth-service.js';

export class UserService {
  private readonly auth = new AuthService();
  private users: User[] = [];

  createUser(name: string, email: string): User {
    const user: User = { id: String(this.users.length + 1), name, email };
    this.users.push(user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  login(userId: string, password: string) {
    const user = this.getUser(userId);
    if (!user) throw new Error('User not found');
    return this.auth.authenticate(user, password);
  }
}
