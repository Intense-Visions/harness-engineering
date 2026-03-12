import { registerUser } from '../services/user-service';

export function handleCreateUser(req: { name: string }) {
  return registerUser(req.name);
}
