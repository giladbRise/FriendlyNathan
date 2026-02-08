import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  validateN8n,
  generateWorkflowPublic,
  previewWorkflowPublic,
  createWorkflowPublic,
  cancelWorkflowPublic,
} from '../controllers/public.controller';

const router = Router();

// Rate limiting for public routes
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 workflow generations per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many workflow generation requests, please try again later.' },
});

// Public routes - no authentication required
// These routes allow direct workflow generation with user-provided credentials

// Validate n8n connection
router.post('/validate-n8n', publicLimiter, validateN8n);

// Generate workflow (credentials provided in request)
router.post('/generate-workflow', generateLimiter, generateWorkflowPublic);
router.post('/preview-workflow', generateLimiter, previewWorkflowPublic);
router.post('/create-workflow', publicLimiter, createWorkflowPublic);

// Cancel workflow generation
router.post('/cancel-workflow/:id', publicLimiter, cancelWorkflowPublic);

export default router;
