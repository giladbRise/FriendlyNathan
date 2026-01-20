import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const skip = (page - 1) * limit;

    // Search filter
    const search = req.query.search as string | undefined;
    const role = req.query.role as string | undefined;
    const isActive = req.query.isActive as string | undefined;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && role !== 'all') {
      where.role = role;
    }

    if (isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              workflowGenerations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get user by ID (admin only)
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            workflowGenerations: true,
            n8nInstances: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update user (admin only)
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role, isActive } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent admin from demoting themselves
    const adminId = (req as any).userId;
    if (id === adminId && role && role !== 'admin') {
      res.status(400).json({ error: 'Cannot demote yourself from admin' });
      return;
    }

    // Prevent deactivating the last admin
    if (isActive === false && existingUser.role === 'admin') {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'admin', isActive: true },
      });
      if (activeAdminCount <= 1) {
        res.status(400).json({ error: 'Cannot deactivate last admin' });
        return;
      }
    }

    // Prevent demoting the last admin
    if (role && role !== 'admin' && existingUser.role === 'admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'admin' },
      });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot demote last admin' });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent admin from deleting themselves
    const adminId = (req as any).userId;
    if (id === adminId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Prevent deleting the last admin
    if (existingUser.role === 'admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'admin' },
      });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot delete last admin' });
        return;
      }
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all workflow generations (audit log)
 */
export const getAuditLog = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const skip = (page - 1) * limit;

    // Filters
    const search = req.query.search as string | undefined;
    const userId = req.query.userId as string | undefined;
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Build where clause
    const where: any = {};

    if (search) {
      where.workflowDescription = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (userId && userId !== 'all') {
      where.userId = userId;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    const [generations, total] = await Promise.all([
      prisma.workflowGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          n8nInstance: {
            select: {
              name: true,
              url: true,
            },
          },
        },
      }),
      prisma.workflowGeneration.count({ where }),
    ]);

    res.json({
      generations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get admin dashboard stats
 */
export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      adminUsers,
      totalWorkflows,
      successfulWorkflows,
      failedWorkflows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.workflowGeneration.count(),
      prisma.workflowGeneration.count({ where: { status: 'success' } }),
      prisma.workflowGeneration.count({ where: { status: 'failed' } }),
    ]);

    res.json({
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          admins: adminUsers,
        },
        workflows: {
          total: totalWorkflows,
          successful: successfulWorkflows,
          failed: failedWorkflows,
        },
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
