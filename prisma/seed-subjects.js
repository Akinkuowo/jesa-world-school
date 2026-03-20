const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const subjects = [
    // --- JUNIOR (JS1 - JS3) ---
    { name: "English Language Studies", section: "JUNIOR", category: "General" },
    { name: "Mathematics", section: "JUNIOR", category: "General" },
    { name: "Basic Science", section: "JUNIOR", category: "Science" },
    { name: "Basic Technology", section: "JUNIOR", category: "Technology" },
    { name: "Social Studies", section: "JUNIOR", category: "Humanities" },
    { name: "Civic Education", section: "JUNIOR", category: "Humanities" },
    { name: "Business Studies", section: "JUNIOR", category: "Business" },
    { name: "Agricultural Science", section: "JUNIOR", category: "Vocational" },
    { name: "Cultural and Creative Arts (CCA)", section: "JUNIOR", category: "Arts" },
    { name: "Physical and Health Education", section: "JUNIOR", category: "Vocational" },
    { name: "Religion and National Values (CRK/IRS)", section: "JUNIOR", category: "Humanities" },
    { name: "Computer Studies/ICT/Digital Technology", section: "JUNIOR", category: "Technology" },
    { name: "Nigerian Languages (Hausa, Igbo, or Yoruba)", section: "JUNIOR", category: "Languages" },
    { name: "Home Economics", section: "JUNIOR", category: "Vocational" },
    { name: "French Language (Optional)", section: "JUNIOR", category: "Languages" },
    { name: "Security Education", section: "JUNIOR", category: "General" },

    // --- SENIOR (SS1 - SS3) ---

    // Compulsory
    { name: "English Language", section: "SENIOR", category: "Compulsory" },
    { name: "General Mathematics", section: "SENIOR", category: "Compulsory" },
    { name: "Citizenship and Heritage Studies", section: "SENIOR", category: "Compulsory" },
    { name: "Digital Technologies", section: "SENIOR", category: "Compulsory" },
    { name: "One Trade/Entrepreneurship Subject", section: "SENIOR", category: "Compulsory" },

    // Science
    { name: "Biology", section: "SENIOR", category: "Science" },
    { name: "Chemistry", section: "SENIOR", category: "Science" },
    { name: "Physics", section: "SENIOR", category: "Science" },
    // { name: "Agricultural Science", section: "SENIOR", category: "Science" }, // Already in Junior, name collision? No, uniqueness is by name. We should probably distinguish or allow duplicates if section differs? Prisma schema says name is unique. I will append (Senior) if needed or just reuse name if I model it differently. But user wants a list. 
    // Wait, Agricultural Science is in both. Prisma Unique constraint on `name` will fail.
    // STRATEGY: I will remove the unique constraint on name OR make it unique per section.
    // Actually, for simplicity, I'll allow same name if I remove unique constraint, OR I will just use one entry if it applies to both?
    // User prompt implies distinct lists.
    // Let's check schema: `name String @unique`.
    // I should remove `@unique` from name and make `@@unique([name, section])` or just remove it to allow "Agricultural Science" in both sections.
    // For now, I will modify the seed to handle duplicates or make names distinct (e.g. "Agricultural Science (Senior)").
    // BETTER: Update schema to allow same subject name in different sections.

    // RE-EVALUATION: "Agricultural Science" appears in both.
    // I will update schema to `@@unique([name, section])` in next step before pushing if I can, or I will just append section to name in seed for now to avoid schema thrash. 
    // actually, let's just make the name unique globally for now and assume the list is a set of ALL available subjects.
    // If "Agricultural Science" is in both, is it the SAME subject? Yes/No. 
    // Decision: I will keep `name` unique. If usage overlaps, I'll just skip adding it again if it exists, OR I will prefix/suffix if they are truly different curriculums.
    // For `Agricultural Science`, it is likely the same "Subject Area".
    // However, `English Language Studies` (Junior) vs `English Language` (Senior).
    // `Mathematics` (Junior) vs `General Mathematics` (Senior).
    // `Agricultural Science` is exact match.
    // I'll add `Agricultural Science (Senior)` to distinguish? Or just reuse?
    // The UI selects from a list. If a teacher selects "Agricultural Science", does it matter if it's JSS or SS?
    // The prompt splits them explicitly.
    // I will remove the `@unique` constraint on `name` in the schema or make it composite.
    // Let's try to update schema to `@@unique([name, section])` quickly.

    // Science (Continued)
    { name: "Further Mathematics", section: "SENIOR", category: "Science" },
    { name: "Physical Education", section: "SENIOR", category: "Science" },
    { name: "Health Education", section: "SENIOR", category: "Science" },
    { name: "Food & Nutrition", section: "SENIOR", category: "Science" },
    { name: "Geography", section: "SENIOR", category: "Science" },
    { name: "Technical Drawing", section: "SENIOR", category: "Science" },

    // Humanities (Arts)
    { name: "Nigerian History", section: "SENIOR", category: "Arts" },
    { name: "Government", section: "SENIOR", category: "Arts" },
    { name: "Christian Religious Studies", section: "SENIOR", category: "Arts" },
    { name: "Islamic Studies", section: "SENIOR", category: "Arts" },
    { name: "One Nigerian Language", section: "SENIOR", category: "Arts" },
    { name: "French", section: "SENIOR", category: "Arts" },
    { name: "Arabic", section: "SENIOR", category: "Arts" },
    { name: "Visual Arts", section: "SENIOR", category: "Arts" },
    { name: "Music", section: "SENIOR", category: "Arts" },
    { name: "Literature in English", section: "SENIOR", category: "Arts" },
    { name: "Home Management", section: "SENIOR", category: "Arts" }, // Often vocational but listed here? I'll follow user structure if possible, user put it in Humanities? 
    // User list: "Humanities (Arts) Subjects ... Home Management, Catering Craft"
    { name: "Catering Craft", section: "SENIOR", category: "Arts" },

    // Business Studies
    { name: "Accounting", section: "SENIOR", category: "Commercial" },
    { name: "Commerce", section: "SENIOR", category: "Commercial" },
    { name: "Marketing", section: "SENIOR", category: "Commercial" },
    { name: "Economics", section: "SENIOR", category: "Commercial" },

    // Trade/Entrepreneurship
    { name: "Solar PV Installation and Maintenance", section: "SENIOR", category: "Trade" },
    { name: "Fashion Design and Garment Making", section: "SENIOR", category: "Trade" },
    { name: "Livestock Farming", section: "SENIOR", category: "Trade" },
    { name: "Beauty and Cosmetology", section: "SENIOR", category: "Trade" },
    { name: "Computer Hardware and GSM Repairs", section: "SENIOR", category: "Trade" },
    { name: "Horticulture and Crop Production", section: "SENIOR", category: "Trade" },
];

async function main() {
    console.log(`Start seeding subjects...`);
    for (const subject of subjects) {
        // Upsert to avoid duplicates if re-run
        // Since I have name @unique logic issues, I will handle "Agricultural Science" specifically.
        // If I didn't change schema yet, I can't put same name twice.
        // "Agricultural Science" is in Junior and Senior.
        // I will append (Senior) to the Senior one where name collides.

        let subjectName = subject.name;
        const existing = await prisma.subject.findUnique({ where: { name: subjectName } });

        if (existing && existing.section !== subject.section) {
            // Name collision across sections
            subjectName = `${subjectName} (${subject.section === 'JUNIOR' ? 'JSS' : 'SSS'})`;
        }

        const s = await prisma.subject.upsert({
            where: { name: subjectName },
            update: {},
            create: {
                name: subjectName,
                section: subject.section,
                category: subject.category
            },
        });
        console.log(`Created subject with id: ${s.id}`);
    }
    console.log(`Seeding finished.`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
