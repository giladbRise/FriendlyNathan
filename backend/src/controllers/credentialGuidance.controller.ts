import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get all credential guidance templates
 */
export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    // Search filter
    const search = req.query.search as string | undefined;
    const isActive = req.query.isActive as string | undefined;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { credentialType: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const [templates, total] = await Promise.all([
      prisma.credentialGuidanceTemplate.findMany({
        where,
        orderBy: { displayName: 'asc' },
        skip,
        take: limit,
      }),
      prisma.credentialGuidanceTemplate.count({ where }),
    ]);

    res.json({
      templates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get all templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get single credential guidance template by ID
 */
export const getTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const template = await prisma.credentialGuidanceTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get credential guidance template by credential type
 */
export const getTemplateByType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    const template = await prisma.credentialGuidanceTemplate.findUnique({
      where: { credentialType: type },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found for this credential type' });
      return;
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template by type error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create new credential guidance template (admin only)
 */
export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      credentialType,
      displayName,
      instructionsMarkdown,
      videoUrl,
      documentationUrl,
      contactInfo,
      isActive = true,
    } = req.body;

    // Validation
    if (!credentialType || !displayName || !instructionsMarkdown) {
      res.status(400).json({
        error: 'credentialType, displayName, and instructionsMarkdown are required',
      });
      return;
    }

    // Check if credential type already exists
    const existingTemplate = await prisma.credentialGuidanceTemplate.findUnique({
      where: { credentialType },
    });

    if (existingTemplate) {
      res.status(409).json({
        error: 'A template with this credential type already exists',
      });
      return;
    }

    const template = await prisma.credentialGuidanceTemplate.create({
      data: {
        credentialType,
        displayName,
        instructionsMarkdown,
        videoUrl: videoUrl || null,
        documentationUrl: documentationUrl || null,
        contactInfo: contactInfo || null,
        isActive,
      },
    });

    res.status(201).json({
      message: 'Template created successfully',
      template,
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update credential guidance template (admin only)
 */
export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      credentialType,
      displayName,
      instructionsMarkdown,
      videoUrl,
      documentationUrl,
      contactInfo,
      isActive,
    } = req.body;

    // Check if template exists
    const existingTemplate = await prisma.credentialGuidanceTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // If changing credential type, check for conflicts
    if (credentialType && credentialType !== existingTemplate.credentialType) {
      const conflictTemplate = await prisma.credentialGuidanceTemplate.findUnique({
        where: { credentialType },
      });

      if (conflictTemplate) {
        res.status(409).json({
          error: 'A template with this credential type already exists',
        });
        return;
      }
    }

    const updatedTemplate = await prisma.credentialGuidanceTemplate.update({
      where: { id },
      data: {
        ...(credentialType !== undefined && { credentialType }),
        ...(displayName !== undefined && { displayName }),
        ...(instructionsMarkdown !== undefined && { instructionsMarkdown }),
        ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
        ...(documentationUrl !== undefined && { documentationUrl: documentationUrl || null }),
        ...(contactInfo !== undefined && { contactInfo: contactInfo || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({
      message: 'Template updated successfully',
      template: updatedTemplate,
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete credential guidance template (admin only)
 */
export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if template exists
    const existingTemplate = await prisma.credentialGuidanceTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await prisma.credentialGuidanceTemplate.delete({
      where: { id },
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
