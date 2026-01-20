const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getToken() {
  const tokens = await prisma.passwordResetToken.findMany({
    where: { used: false },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 1
  });

  if (tokens.length > 0) {
    const token = tokens[0];
    console.log('Token:', token.token);
    console.log('User:', token.user.email);
    console.log('Reset URL:', `http://localhost:5173/reset-password?token=${token.token}`);
  } else {
    console.log('No unused tokens found');
  }

  await prisma.$disconnect();
}

getToken();
