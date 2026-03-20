const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- EXAMS ---");
  const exams = await prisma.examSchedule.findMany();
  console.log(JSON.stringify(exams, null, 2));

  console.log("\n--- RECENT RESULTS (LAST 10) ---");
  const results = await prisma.studentResult.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { student: { select: { firstName: true, studentId: true } } }
  });
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
