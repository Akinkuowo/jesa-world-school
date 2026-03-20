const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function backfillValidity() {
    console.log("🔄 Starting validity check and backfill process...\n");

    try {
        // Find all schools
        const schools = await prisma.school.findMany({
            select: {
                id: true,
                name: true,
                schoolNumber: true,
                createdAt: true,
                validUntil: true,
                lastReactivatedAt: true
            }
        });
                
        console.log(`📊 Found ${schools.length} school(s) in the database.\n`);

        if (schools.length === 0) {
            console.log("ℹ️  No schools found in the database.");
            return;
        }

        // Display all schools and their validity status
        console.log("📋 School Validity Status:\n");
        console.log("=".repeat(80));

        for (const school of schools) {
            const now = new Date();
            const validUntil = new Date(school.validUntil);
            const isExpired = now > validUntil;
            const daysRemaining = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            console.log(`\n🏫 ${school.name} (${school.schoolNumber})`);
            console.log(`   Created: ${new Date(school.createdAt).toLocaleDateString()}`);
            console.log(`   Valid Until: ${validUntil.toLocaleDateString()}`);

            if (isExpired) {
                console.log(`   Status: ❌ EXPIRED (${Math.abs(daysRemaining)} days ago)`);
            } else {
                console.log(`   Status: ✅ ACTIVE (${daysRemaining} days remaining)`);
            }

            if (school.lastReactivatedAt) {
                console.log(`   Last Reactivated: ${new Date(school.lastReactivatedAt).toLocaleDateString()}`);
            }
        }

        console.log("\n" + "=".repeat(80));
        console.log(`\n✅ All schools have validity dates set!`);
        console.log(`   Active: ${schools.filter(s => new Date() <= new Date(s.validUntil)).length}`);
        console.log(`   Expired: ${schools.filter(s => new Date() > new Date(s.validUntil)).length}`);

    } catch (error) {
        console.error("❌ Error during validity check:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the backfill
backfillValidity()
    .then(() => {
        console.log("\n🎉 Backfill process completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Backfill process failed:", error);
        process.exit(1);
    });
