import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  validateInstance,
} from '../controllers/n8nInstance.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/n8n-instances - List user's saved n8n instances
router.get('/', getInstances);

// GET /api/n8n-instances/:id - Get specific instance
router.get('/:id', getInstance);

// POST /api/n8n-instances - Create new n8n instance
router.post('/', createInstance);

// PUT /api/n8n-instances/:id - Update n8n instance
router.put('/:id', updateInstance);

// DELETE /api/n8n-instances/:id - Delete n8n instance
router.delete('/:id', deleteInstance);

// POST /api/n8n-instances/validate - Validate n8n URL and API key
router.post('/validate', validateInstance);

export default router;
