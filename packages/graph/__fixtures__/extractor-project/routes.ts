import { Router } from 'express';

const router = Router();

router.get('/api/users', listUsers);
router.get('/api/users/:id', getUser);
router.post('/api/users', createUser);
router.put('/api/users/:id', updateUser);
router.delete('/api/users/:id', deleteUser);

router.get('/api/orders', listOrders);
router.post('/api/orders', createOrder);
router.get('/api/orders/:id', getOrder);

app.get('/api/health', healthCheck);

export default router;
