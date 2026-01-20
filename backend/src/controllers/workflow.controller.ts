import { Request, Response } from 'express';
import { z } from 'zod';
import { workflowGeneratorService } from '../services/workflowGenerator.service';

// Validation schemas
const generateWorkflowSchema = z.object({
  instanceId: z.string().uuid('Invalid instance ID'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description too long'),
  socketId: z.string().optional(),
  skipDuplicateCheck: z.boolean().optional(),
});

/**
 * Generate a workflow from description
 */
export const generateWorkflow = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const validatedData = generateWorkflowSchema.parse(req.body);

    const result = await workflowGeneratorService.generateWorkflow(
      userId,
      validatedData.instanceId,
      validatedData.description,
      validatedData.socketId,
      validatedData.skipDuplicateCheck
    );

    // Check if duplicate warning was returned
    if (result.duplicateWarning) {
      return res.status(200).json({
        message: 'Duplicate workflow detected',
        duplicateWarning: {
          existingId: result.duplicateWarning.existingId,
          createdAt: result.duplicateWarning.createdAt,
          message: 'A similar workflow was created recently. You can proceed anyway or view the existing one.',
        },
      });
    }

    res.status(202).json({
      message: 'Workflow generation started',
      generationId: result.generationId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    if (error instanceof Error) {
      if (error.message === 'n8n instance not found') {
        return res.status(404).json({ error: 'n8n instance not found' });
      }
    }

    console.error('Generate workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Cancel an in-progress workflow generation
 */
export const cancelGeneration = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { socketId } = req.body;

    await workflowGeneratorService.cancelGeneration(id, userId, socketId);

    res.json({ message: 'Workflow generation cancelled', generationId: id });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Generation not found') {
        return res.status(404).json({ error: 'Workflow generation not found' });
      }
      if (error.message === 'Generation is not in progress') {
        return res.status(400).json({ error: 'Generation is not in progress' });
      }
    }

    console.error('Cancel generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get workflow generation by ID
 */
export const getGeneration = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const generation = await workflowGeneratorService.getGeneration(id, userId);

    if (!generation) {
      return res.status(404).json({ error: 'Workflow generation not found' });
    }

    res.json({ generation });
  } catch (error) {
    console.error('Get generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get user's workflow history
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Filters
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    // Sorting
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = req.query.sortOrder as string | undefined;

    const result = await workflowGeneratorService.getHistory(userId, page, limit, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      search,
      sortBy: sortBy as 'date' | 'status' | 'duration' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
