import prisma from '../lib/prisma.js';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/delete-user-by-email.mjs <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, username: true, emailVerified: true }
});

if (!user) {
  console.log('NOT_FOUND');
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction([
  prisma.matchAnswer.deleteMany({ where: { userId: user.id } }),
  prisma.match.updateMany({ where: { winnerId: user.id }, data: { winnerId: null } }),
  prisma.match.updateMany({ where: { player1Id: user.id }, data: { player1Id: null } }),
  prisma.match.updateMany({ where: { player2Id: user.id }, data: { player2Id: null } }),
  prisma.user.delete({ where: { id: user.id } })
]);

console.log(
  JSON.stringify({
    deleted: true,
    email,
    username: user.username,
    emailVerified: user.emailVerified
  })
);

await prisma.$disconnect();
