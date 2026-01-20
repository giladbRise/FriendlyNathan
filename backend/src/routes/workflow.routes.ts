import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { workflowGenerationLimiter } from '../middleware/rateLimiter';
import {
  generateWorkflow,
  cancelGeneration,
  getGeneration,
  getHistory,
} from '../controllers/workflow.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/workflows/generate - Generate a workflow from description
// Apply rate limiting to prevent abuse
router.post('/generate', workflowGenerationLimiter, generateWorkflow);

// GET /api/workflows/history - Get user's workflow history
router.get('/history', getHistory);

// POST /api/workflows/:id/cancel - Cancel an in-progress generation
router.post('/:id/cancel', cancelGeneration);

// GET /api/workflows/:id - Get specific workflow generation
router.get('/:id', getGeneration);

export default router;
