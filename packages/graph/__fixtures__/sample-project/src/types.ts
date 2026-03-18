export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: Date;
}

export const MAX_USERS = 100;
