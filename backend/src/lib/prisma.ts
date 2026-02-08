import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient to avoid creating multiple instances
const prisma = new PrismaClient();

export default prisma;
