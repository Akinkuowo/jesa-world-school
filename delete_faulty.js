const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.studentResult.delete({
    where: { id: "cmmw4igex0001ohu0fzwr56nj" }
  });
  console.log("Deleted result:", deleted);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
