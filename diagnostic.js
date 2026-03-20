const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- STUDENT RESULTS ---");
  const results = await prisma.studentResult.findMany({
    take: 5,
    include: {
      student: { select: { firstName: true, lastName: true } }
    }
  });
  console.log(JSON.stringify(results, null, 2));

  console.log("\n--- EXAM QUESTIONS ---");
  const questions = await prisma.examQuestion.findMany({
    take: 5
  });
  console.log(JSON.stringify(questions, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
