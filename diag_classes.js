const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const examClasses = await prisma.studentResult.findMany({
    select: { class: true },
    distinct: ['class']
  });
  console.log('Unique Classes in StudentResults:', examClasses.map(c => c.class));

  const userClasses = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { studentClass: true },
    distinct: ['studentClass']
  });
  console.log('Unique StudentClasses in Users:', userClasses.map(c => c.studentClass));
  
  const teacherSubjects = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    select: { subjects: true }
  });
  console.log('Teacher Subjects:', teacherSubjects);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
