const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function generateStudentIds() {
    console.log("🔄 Starting student ID generation process...\n");

    try {
        // Find all students without student IDs
        const students = await prisma.user.findMany({
            where: {
                role: "STUDENT",
                studentId: null
            },
            include: {
                school: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        console.log(`📊 Found ${students.length} student(s) without student IDs.\n`);

        if (students.length === 0) {
            console.log("✅ All students already have student IDs.");
            return;
        }

        // Group students by school
        const studentsBySchool = students.reduce((acc, student) => {
            const schoolId = student.schoolId;
            if (!acc[schoolId]) {
                acc[schoolId] = [];
            }
            acc[schoolId].push(student);
            return acc;
        }, {});

        let totalUpdated = 0;

        // Generate student IDs for each school
        for (const [schoolId, schoolStudents] of Object.entries(studentsBySchool)) {
            const school = schoolStudents[0].school;
            console.log(`\n🏫 Processing ${school.name} (${school.schoolNumber})...`);

            for (let i = 0; i < schoolStudents.length; i++) {
                const student = schoolStudents[i];
                const sequentialNumber = String(i + 1).padStart(3, '0');
                const studentId = `STU-${school.schoolNumber}-${sequentialNumber}`;

                await prisma.user.update({
                    where: { id: student.id },
                    data: { studentId }
                });

                console.log(`  ✓ ${student.firstName} ${student.lastName} → ${studentId}`);
                totalUpdated++;
            }
        }

        console.log(`\n✅ Successfully generated ${totalUpdated} student ID(s)!`);

        // Verify
        const remainingNull = await prisma.user.count({
            where: { role: "STUDENT", studentId: null }
        });

        if (remainingNull === 0) {
            console.log("✅ Verification passed: All students now have student IDs.");
        } else {
            console.log(`⚠️  Warning: ${remainingNull} student(s) still don't have student IDs.`);
        }

    } catch (error) {
        console.error("❌ Error during student ID generation:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
generateStudentIds()
    .then(() => {
        console.log("\n🎉 Student ID generation completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Student ID generation failed:", error);
        process.exit(1);
    });
