import { Request, Response } from 'express';
import { z } from 'zod';
import { encrypt, decrypt } from '../utils/encryption';
import axios from 'axios';
import prisma from '../lib/prisma';

// Validation schemas
const createInstanceSchema = z.object({
  name: z.string().max(255, 'Name too long').optional(),
  url: z.string().url('Invalid URL format').max(500, 'URL too long'),
  apiKey: z.string().min(1, 'API key is required'),
  isDefault: z.boolean().optional().default(false),
});

const updateInstanceSchema = z.object({
  name: z.string().min(1, 'Instance name is required').max(255, 'Name too long').optional(),
  url: z.string().url('Invalid URL format').max(500, 'URL too long').optional(),
  apiKey: z.string().min(1, 'API key is required').optional(),
  isDefault: z.boolean().optional(),
});

const validateInstanceSchema = z.object({
  url: z.string().url('Invalid URL format'),
  apiKey: z.string().min(1, 'API key is required'),
});

/**
 * Validate n8n instance by testing the API connection
 */
async function validateN8nConnection(url: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Remove trailing slash from URL if present
    const baseUrl = url.replace(/\/$/, '');

    // Test connection by fetching workflows (simple endpoint that requires auth)
    const response = await axios.get(`${baseUrl}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': apiKey,
      },
      timeout: 10000, // 10 second timeout
    });

    if (response.status === 200) {
      return { valid: true };
    }

    return { valid: false, error: 'Invalid response from n8n instance' };
  } catch (error: any) {
    if (error.response) {
      // The request was made and the server responded with a status code
      if (error.response.status === 401 || error.response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: `n8n instance error: ${error.response.status}` };
    } else if (error.request) {
      // The request was made but no response was received
      return { valid: false, error: 'Cannot reach n8n instance. Check the URL.' };
    } else {
      // Something happened in setting up the request
      return { valid: false, error: 'Failed to connect to n8n instance' };
    }
  }
}

/**
 * Get all n8n instances for the current user
 */
export const getInstances = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const instances = await prisma.n8nInstance.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { lastUsedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        name: true,
        url: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
    });

    res.json({ instances });
  } catch (error) {
    console.error('Get instances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get a single n8n instance by ID
 */
export const getInstance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const instance = await prisma.n8nInstance.findFirst({
      where: {
        id,
        userId,
      },
      select: {
        id: true,
        name: true,
        url: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
    });

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ instance });
  } catch (error) {
    console.error('Get instance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create a new n8n instance
 */
export const createInstance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const validatedData = createInstanceSchema.parse(req.body);

    // Validate n8n connection
    const validation = await validateN8nConnection(validatedData.url, validatedData.apiKey);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error || 'Invalid n8n instance' });
      return;
    }

    // If this is set as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.n8nInstance.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Encrypt API key
    const apiKeyEncrypted = encrypt(validatedData.apiKey);

    // Auto-generate name from URL if not provided
    let instanceName = validatedData.name;
    if (!instanceName || instanceName.trim() === '') {
      try {
        const urlObj = new URL(validatedData.url);
        instanceName = urlObj.hostname.replace(/^(www\.|n8n\.)/, '').split('.')[0] || 'n8n Instance';
      } catch {
        instanceName = 'n8n Instance';
      }
    }

    // Create instance
    const instance = await prisma.n8nInstance.create({
      data: {
        userId,
        name: instanceName,
        url: validatedData.url,
        apiKeyEncrypted,
        isDefault: validatedData.isDefault,
      },
      select: {
        id: true,
        name: true,
        url: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
    });

    res.status(201).json({
      message: 'n8n instance created successfully',
      instance,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Create instance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update an existing n8n instance
 */
export const updateInstance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const validatedData = updateInstanceSchema.parse(req.body);

    // Check if instance exists and belongs to user
    const existingInstance = await prisma.n8nInstance.findFirst({
      where: { id, userId },
    });

    if (!existingInstance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    // If URL or API key changed, validate the new connection
    if (validatedData.url || validatedData.apiKey) {
      const urlToValidate = validatedData.url || existingInstance.url;
      const apiKeyToValidate = validatedData.apiKey || decrypt(existingInstance.apiKeyEncrypted);

      const validation = await validateN8nConnection(urlToValidate, apiKeyToValidate);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error || 'Invalid n8n instance' });
        return;
      }
    }

    // If this is set as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.n8nInstance.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.name) updateData.name = validatedData.name;
    if (validatedData.url) updateData.url = validatedData.url;
    if (validatedData.apiKey) updateData.apiKeyEncrypted = encrypt(validatedData.apiKey);
    if (validatedData.isDefault !== undefined) updateData.isDefault = validatedData.isDefault;

    // Update instance
    const instance = await prisma.n8nInstance.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        url: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
    });

    res.json({
      message: 'n8n instance updated successfully',
      instance,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Update instance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete an n8n instance
 */
export const deleteInstance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    // Check if instance exists and belongs to user
    const existingInstance = await prisma.n8nInstance.findFirst({
      where: { id, userId },
    });

    if (!existingInstance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    // Delete instance
    await prisma.n8nInstance.delete({
      where: { id },
    });

    res.json({ message: 'n8n instance deleted successfully' });
  } catch (error) {
    console.error('Delete instance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Validate n8n instance connection
 */
export const validateInstance = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = validateInstanceSchema.parse(req.body);

    const validation = await validateN8nConnection(validatedData.url, validatedData.apiKey);

    if (validation.valid) {
      res.json({ valid: true, message: 'Connection successful' });
    } else {
      res.status(400).json({ valid: false, error: validation.error });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Validate instance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
