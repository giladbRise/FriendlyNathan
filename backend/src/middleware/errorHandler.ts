import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  if (res.headersSent) {
    return next(err);
  }

  // Handle Prisma/database connection errors
  if (err.message.includes('connect') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('database') ||
      err.name === 'PrismaClientInitializationError' ||
      err.name === 'PrismaClientKnownRequestError') {
    return res.status(503).json({
      error: 'Database connection error',
      message: 'Unable to connect to database. Please try again later.',
    });
  }

  // Handle validation errors
  if (err.name === 'ZodError' || err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message,
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
