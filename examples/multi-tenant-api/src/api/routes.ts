import { Router } from 'express';
import { tenantContextMiddleware } from '../middleware/tenant-context';
import { createUser, listUsers, getUserById } from '../services/user-service';

export const router = Router();

router.use(tenantContextMiddleware);

router.post('/users', (req, res) => {
  try {
    const user = createUser(req.tenant!.tenantId, req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid input' });
  }
});

router.get('/users', (req, res) => {
  const users = listUsers(req.tenant!.tenantId);
  res.json(users);
});

router.get('/users/:id', (req, res) => {
  const user = getUserById(req.tenant!.tenantId, req.params.id);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json(user);
});
