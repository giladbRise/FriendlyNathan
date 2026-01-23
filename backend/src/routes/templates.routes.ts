import { Router } from 'express';
import { templatesController } from '../controllers/templates.controller';

const router = Router();

// Public routes (no authentication required)
router.get('/', (req, res) => templatesController.getAllTemplates(req, res));
router.get('/categories', (req, res) => templatesController.getCategories(req, res));
router.get('/search', (req, res) => templatesController.searchTemplates(req, res));
router.get('/:id', (req, res) => templatesController.getTemplate(req, res));
router.post('/:id/fill', (req, res) => templatesController.fillTemplate(req, res));

export default router;
