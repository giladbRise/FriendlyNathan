import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  generateWorkflow,
  getGeneration,
  getHistory,
} from '../controllers/workflow.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/workflows/generate - Generate a workflow from description
router.post('/generate', generateWorkflow);

// GET /api/workflows/history - Get user's workflow history
router.get('/history', getHistory);

// GET /api/workflows/:id - Get specific workflow generation
router.get('/:id', getGeneration);

export default router;
