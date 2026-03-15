export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
}
