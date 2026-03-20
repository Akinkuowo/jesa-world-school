const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs"); // Make sure to use bcryptjs as used in server.js

const prisma = new PrismaClient();

async function createTestData() {
    console.log("🌱 Creating test data...");

    try {
        // 1. Create a School
        const school = await prisma.school.upsert({
            where: { schoolNumber: "TEST001" },
            update: {},
            create: {
                schoolNumber: "TEST001",
                name: "Test Academy",
                email: "test@academy.com",
                isActive: true,
                validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000) // 120 days from now
            }
        });
        console.log("🏫 School created:", school.name, `(${school.schoolNumber})`);

        // 2. Create a Student
        const hashedPassword = await bcrypt.hash("password123", 10);

        // Check if student exists first to avoid duplicate email error if running multiple times
        let student = await prisma.user.findUnique({
            where: { email: "student@test.com" }
        });

        if (!student) {
            // Generate student ID manually here as our backend logic does it in the API
            const studentCount = await prisma.user.count({
                where: { schoolId: school.id, role: "STUDENT" }
            });
            const sequentialNumber = String(studentCount + 1).padStart(3, '0');
            const studentId = `STU-${school.schoolNumber}-${sequentialNumber}`;

            student = await prisma.user.create({
                data: {
                    email: "student@test.com",
                    password: hashedPassword,
                    firstName: "Test",
                    lastName: "Student",
                    role: "STUDENT",
                    schoolId: school.id,
                    studentId: studentId,
                    isActive: true
                }
            });
            console.log("👨‍🎓 Student user created:", student.email);
            console.log("🔑 Student ID:", student.studentId);
        } else {
            console.log("👨‍🎓 Student user already exists:", student.email);
            console.log("🔑 Student ID:", student.studentId);
        }

        // 3. Create a Teacher
        let teacher = await prisma.user.findUnique({
            where: { email: "teacher@test.com" }
        });

        if (!teacher) {
            teacher = await prisma.user.create({
                data: {
                    email: "teacher@test.com",
                    password: hashedPassword,
                    firstName: "Test",
                    lastName: "Teacher",
                    role: "TEACHER",
                    schoolId: school.id,
                    isActive: true
                }
            });
            console.log("👩‍🏫 Teacher user created:", teacher.email);
        } else {
            console.log("👩‍🏫 Teacher user already exists:", teacher.email);
        }

        return { studentId: student.studentId };

    } catch (error) {
        console.error("❌ Error creating test data:", error);
    } finally {
        await prisma.$disconnect();
    }
}

createTestData();
