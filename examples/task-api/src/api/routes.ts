import { Router } from 'express';
import { createTask, listTasks, getTaskById, completeTask } from '../services/task-service';

export const router = Router();

router.post('/tasks', (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const task = createTask({ title, description: description ?? '' });
  res.status(201).json(task);
});

router.get('/tasks', (_req, res) => {
  res.json(listTasks());
});

router.get('/tasks/:id', (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});

router.patch('/tasks/:id/complete', (req, res) => {
  const task = completeTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});
