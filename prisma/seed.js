const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
    const adminEmail = "superadmin@jesa.com";
    const adminPassword = "password123";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const user = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            firstName: "Super",
            lastName: "Admin",
            password: hashedPassword,
            role: "SUPERADMIN",
        },
    });

    console.log("Super Admin created:", user.email);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
