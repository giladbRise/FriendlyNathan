const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const email = 'admin@rise.com';
    const password = 'Admin123';

    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('Admin user already exists:', email);
      if (existing.role !== 'admin') {
        // Update to admin role
        await prisma.user.update({
          where: { email },
          data: { role: 'admin' }
        });
        console.log('Updated existing user to admin role');
      }
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User',
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', admin.role);
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
