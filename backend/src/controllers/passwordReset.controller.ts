import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Validation schemas
const requestResetSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = requestResetSchema.parse(req.body);

    // Normalize email: trim whitespace and convert to lowercase
    const normalizedEmail = validatedData.email.trim().toLowerCase();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always return success message (security: don't reveal if email exists)
    if (!user) {
      res.json({
        message: 'If that email exists, a password reset link has been sent.',
      });
      return;
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // In development, log the reset link to console
    const resetLink = `http://localhost:5173/reset-password?token=${token}`;
    console.log('');
    console.log('==========================================');
    console.log('PASSWORD RESET LINK (Development Mode)');
    console.log('==========================================');
    console.log('Email:', user.email);
    console.log('Reset Link:', resetLink);
    console.log('Expires:', expiresAt.toLocaleString());
    console.log('==========================================');
    console.log('');

    res.json({
      message: 'If that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);

    // Find token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: validatedData.token },
      include: { user: true },
    });

    if (!resetToken) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    // Check if token was already used
    if (resetToken.used) {
      res.status(400).json({ error: 'Reset token has already been used' });
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // Update user password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
      return;
    }

    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
