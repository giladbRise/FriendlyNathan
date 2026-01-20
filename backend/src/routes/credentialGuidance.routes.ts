import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  getAllTemplates,
  getTemplateById,
  getTemplateByType,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../controllers/credentialGuidance.controller';

const router = Router();

// Public endpoints (authenticated users can view guidance)
router.get('/', authenticate, getAllTemplates);
router.get('/type/:type', authenticate, getTemplateByType);
router.get('/:id', authenticate, getTemplateById);

// Admin-only endpoints
router.post('/', authenticate, requireAdmin, createTemplate);
router.put('/:id', authenticate, requireAdmin, updateTemplate);
router.delete('/:id', authenticate, requireAdmin, deleteTemplate);

export default router;
