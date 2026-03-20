const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- ALL STUDENT RESULTS ---");
  const results = await prisma.studentResult.findMany({
    include: {
      student: { select: { firstName: true, lastName: true, email: true } }
    }
  });
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
