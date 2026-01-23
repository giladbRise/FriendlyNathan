import { Request, Response } from 'express';
import { workflowTemplatesService } from '../services/workflow-templates.service';

export class TemplatesController {
  /**
   * Get all templates
   */
  async getAllTemplates(req: Request, res: Response) {
    try {
      const templates = workflowTemplatesService.getAllTemplates();
      res.json({ templates });
    } catch (error: any) {
      console.error('Error getting templates:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(req: Request, res: Response) {
    try {
      const { category } = req.params;
      const templates = workflowTemplatesService.getTemplatesByCategory(category);
      res.json({ templates });
    } catch (error: any) {
      console.error('Error getting templates by category:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  /**
   * Get all categories
   */
  async getCategories(req: Request, res: Response) {
    try {
      const categories = workflowTemplatesService.getCategories();
      res.json({ categories });
    } catch (error: any) {
      console.error('Error getting categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  }

  /**
   * Search templates
   */
  async searchTemplates(req: Request, res: Response) {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }
      const templates = workflowTemplatesService.searchTemplates(q);
      res.json({ templates });
    } catch (error: any) {
      console.error('Error searching templates:', error);
      res.status(500).json({ error: 'Failed to search templates' });
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const template = workflowTemplatesService.getTemplateById(id);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json({ template });
    } catch (error: any) {
      console.error('Error getting template:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  }

  /**
   * Fill template with values
   */
  async fillTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { values } = req.body;

      if (!values || typeof values !== 'object') {
        return res.status(400).json({ error: 'Values object is required' });
      }

      // Validate fields
      const validation = workflowTemplatesService.validateFields(id, values);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
      }

      const description = workflowTemplatesService.fillTemplate(id, values);
      res.json({ description });
    } catch (error: any) {
      console.error('Error filling template:', error);
      res.status(500).json({ error: 'Failed to fill template' });
    }
  }
}

export const templatesController = new TemplatesController();
