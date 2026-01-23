import { Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { publicWorkflowService } from '../services/publicWorkflow.service';

// Validation schemas
const validateN8nSchema = z.object({
  url: z.string().url('Invalid n8n URL'),
  apiKey: z.string().min(1, 'API key is required'),
});

const generateWorkflowSchema = z.object({
  n8nUrl: z.string().url('Invalid n8n URL'),
  n8nApiKey: z.string().min(1, 'n8n API key is required'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description too long'),
  socketId: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

const previewWorkflowSchema = generateWorkflowSchema.omit({ socketId: true });

const createWorkflowSchema = z.object({
  n8nUrl: z.string().url('Invalid n8n URL'),
  n8nApiKey: z.string().min(1, 'n8n API key is required'),
  previewId: z.string().min(1, 'Preview ID is required'),
});

/**
 * Validate n8n connection (no auth required)
 */
export const validateN8n = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = validateN8nSchema.parse(req.body);
    const baseUrl = validatedData.url.replace(/\/$/, '');

    console.log(`[validateN8n] Testing connection to: ${baseUrl}`);
    console.log(`[validateN8n] API Key length: ${validatedData.apiKey.length} chars`);

    // Try to call the n8n API to verify credentials
    try {
      const response = await axios.get(`${baseUrl}/api/v1/workflows`, {
        headers: {
          'X-N8N-API-KEY': validatedData.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      // If we get here, the connection is valid
      const workflowCount = response.data?.data?.length || 0;
      console.log(`[validateN8n] ✅ Success! Found ${workflowCount} workflows`);
      res.json({
        valid: true,
        message: `Connection successful! Found ${workflowCount} existing workflows.`,
      });
    } catch (apiError: any) {
      console.error(`[validateN8n] ❌ Error:`, {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        message: apiError.message,
        code: apiError.code,
        url: `${baseUrl}/api/v1/workflows`
      });

      if (apiError.response?.status === 401) {
        res.status(400).json({
          valid: false,
          error: 'Invalid API key. Please check your n8n API key.',
        });
        return;
      }
      if (apiError.response?.status === 403) {
        res.status(400).json({
          valid: false,
          error: 'Access denied. Your API key may not have the required permissions.',
        });
        return;
      }
      if (!apiError.response) {
        res.status(400).json({
          valid: false,
          error: `Cannot reach n8n instance at ${baseUrl}. Please check the URL.`,
        });
        return;
      }

      res.status(400).json({
        valid: false,
        error: apiError.response?.data?.message || 'Failed to connect to n8n instance',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Validate n8n error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Generate workflow without authentication
 * Credentials are provided directly in the request
 */
export const generateWorkflowPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = generateWorkflowSchema.parse(req.body);

    const result = await publicWorkflowService.generateWorkflow(
      validatedData.n8nUrl,
      validatedData.n8nApiKey,
      validatedData.description,
      validatedData.socketId,
      validatedData.geminiApiKey
    );

    res.status(202).json({
      message: 'Workflow generation started',
      generationId: result.generationId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Generate workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Preview workflow without creating it in n8n
 */
export const previewWorkflowPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = previewWorkflowSchema.parse(req.body);
    const result = await publicWorkflowService.previewWorkflow(
      validatedData.n8nUrl,
      validatedData.n8nApiKey,
      validatedData.description,
      validatedData.geminiApiKey
    );

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Preview workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create workflow in n8n from a provided workflow JSON
 */
export const createWorkflowPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = createWorkflowSchema.parse(req.body);
    const result = await publicWorkflowService.createWorkflowFromPreview(
      validatedData.n8nUrl,
      validatedData.n8nApiKey,
      validatedData.previewId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to create workflow' });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Cancel workflow generation (no auth required)
 */
export const cancelWorkflowPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { socketId } = req.body;

    await publicWorkflowService.cancelGeneration(id, socketId);

    res.json({ message: 'Workflow generation cancelled', generationId: id });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Generation not found') {
        res.status(404).json({ error: 'Workflow generation not found' });
        return;
      }
      if (error.message === 'Generation is not in progress') {
        res.status(400).json({ error: 'Generation is not in progress' });
        return;
      }
    }

    console.error('Cancel generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
