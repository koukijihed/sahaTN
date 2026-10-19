import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient, Role } from '@prisma/client';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to create an administrator.');
  process.exit(1);
}

if (!email || !password) {
  console.error(
    'ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.'
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error('ADMIN_PASSWORD must be at least 12 characters long.');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      email,
      passwordHash,
      status: 'ACTIVE',
      roles: { create: [{ role: Role.ADMIN }] }
    }
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: Role.ADMIN } },
    update: {},
    create: { userId: user.id, role: Role.ADMIN }
  });

  console.log(
    `Administrator account ensured for ${email}. No password was logged.`
  );
} finally {
  await prisma.$disconnect();
}
