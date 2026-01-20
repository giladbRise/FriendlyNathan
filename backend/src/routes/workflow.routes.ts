import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { workflowGenerationLimiter } from '../middleware/rateLimiter';
import {
  generateWorkflow,
  cancelGeneration,
  getGeneration,
  getHistory,
} from '../controllers/workflow.controller';
import { activityService } from '../services/activity.service';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/workflows/generate - Generate a workflow from description
// Apply rate limiting to prevent abuse
router.post('/generate', workflowGenerationLimiter, generateWorkflow);

// GET /api/workflows/history - Get user's workflow history
router.get('/history', getHistory);

// GET /api/workflows/activity - Get activity feed (diverse action types)
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const feed = await activityService.getActivityFeed(userId, limit);

    res.json({ activities: feed });
  } catch (error) {
    console.error('Get activity feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workflows/:id/cancel - Cancel an in-progress generation
router.post('/:id/cancel', cancelGeneration);

// GET /api/workflows/:id - Get specific workflow generation
router.get('/:id', getGeneration);

export default router;
