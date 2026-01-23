import { Router } from 'express';
import {
  validateN8n,
  generateWorkflowPublic,
  previewWorkflowPublic,
  createWorkflowPublic,
  cancelWorkflowPublic,
} from '../controllers/public.controller';

const router = Router();

// Public routes - no authentication required
// These routes allow direct workflow generation with user-provided credentials

// Validate n8n connection
router.post('/validate-n8n', validateN8n);

// Generate workflow (credentials provided in request)
router.post('/generate-workflow', generateWorkflowPublic);
router.post('/preview-workflow', previewWorkflowPublic);
router.post('/create-workflow', createWorkflowPublic);

// Cancel workflow generation
router.post('/cancel-workflow/:id', cancelWorkflowPublic);

export default router;
