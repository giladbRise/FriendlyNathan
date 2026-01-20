import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
