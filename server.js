require('dotenv').config();
const Fastify = require("fastify");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const cors = require("@fastify/cors");
const jwt = require("jsonwebtoken");
const multipart = require("@fastify/multipart");
const { v4: uuidv4 } = require('uuid');
const nodemailer = require("nodemailer");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Email Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper: Send Email
const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"Jesa World SMS" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    app.log.error("Failed to send email:", error);
  }
};

// Helper: Robust AI Content Generation with Fallback
const generateAiContent = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
  let lastError = null;

  for (const modelName of models) {
    try {
      console.log(`Attempting AI generation with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      lastError = err;
      console.warn(`Model ${modelName} failed: ${err.message}`);
      // If it's a quota error (429) or model not found (404), try next model
      if (err.status === 429 || err.status === 404) continue;
      // For other errors, break and throw
      break;
    }
  }

  throw lastError || new Error("AI Generation failed across all models");
};

// Helper: Generate Unique School Number
const generateSchoolNumber = async () => {
  let unique = false;
  let number = "";
  while (!unique) {
    number = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit number
    const existing = await prisma.school.findUnique({ where: { schoolNumber: number } });
    if (!existing) unique = true;
  }
  return number;
};

async function start() {
  await app.register(cors, {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // Middleware: Authenticate JWT
  app.decorate("authenticate", async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(" ")[1];
      if (!token) throw new Error("No token provided");
      const decoded = jwt.verify(token, JWT_SECRET);
      request.user = decoded;
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  // --- Auth Routes ---

  // Super Admin Registration
  app.post("/api/auth/superadmin/register", async (request, reply) => {
    const { email, password, firstName, lastName } = request.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: "SUPERADMIN",
          isEmailVerified: false,
          verificationCode
        }
      });

      // Send Verification Email
      await sendEmail(
        email,
        "Verify your Super Admin Account",
        `<p>Your verification code is: <strong>${verificationCode}</strong></p>`
      );

      return { message: "Verification code sent to email", email };
    } catch (err) {
      if (err.code === 'P2002') {
        return reply.code(400).send({ error: "Email already exists" });
      }
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to initiate super admin registration" });
    }
  });

  // Verify Email Endpoint
  app.post("/api/auth/superadmin/verify-email", async (request, reply) => {
    const { email, code } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || user.verificationCode !== code) {
        return reply.code(400).send({ error: "Invalid verification code" });
      }

      await prisma.user.update({
        where: { email },
        data: {
          isEmailVerified: true,
          verificationCode: null
        }
      });

      const token = jwt.sign({ id: user.id, email: user.email, role: "SUPERADMIN" }, JWT_SECRET);
      return { token, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: "SUPERADMIN" } };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Verification failed" });
    }
  });

  // Login (Multi-tenant)
  app.post("/api/auth/login", async (request, reply) => {
    const { email, password, schoolNumber, role, studentId } = request.body;

    if (role === "SUPERADMIN") {
      const user = await prisma.user.findFirst({
        where: { email, role: "SUPERADMIN" }
      });
      if (!user) {
        return reply.code(404).send({ error: "Incorrect email" });
      }
      if (!(await bcrypt.compare(password, user.password))) {
        return reply.code(401).send({ error: "Incorrect password" });
      }

      if (!user.isEmailVerified) {
        return reply.code(403).send({ error: "Email not verified", requiresVerification: true });
      }

      // Generate 2FA Code
      const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
      const twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorCode, twoFactorExpires }
      });

      // Send 2FA Email
      await sendEmail(
        email,
        "Your 2FA Login Code",
        `<p>Your login code is: <strong>${twoFactorCode}</strong>. Use this to complete your login.</p>`
      );

      return { requires2FA: true, email };
    }

    // Student Login: Use studentId OR email + password
    if (role === "STUDENT") {
      if (!studentId && !email) return reply.code(400).send({ error: "Student ID or Email is required" });

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { studentId: studentId || undefined },
            { email: email || undefined }
          ],
          role: "STUDENT"
        },
        include: { school: true }
      });
      if (!user) {
        return reply.code(404).send({ error: studentId ? "Student ID can't be found" : "Email can't be found" });
      }
      if (!user.isActive) {
        return reply.code(403).send({ error: "Account inactive. Please contact admin." });
      }
      if (!(await bcrypt.compare(password, user.password))) {
        return reply.code(401).send({ error: "Incorrect password" });
      }

      // Check School Validity
      const now = new Date();
      const validUntil = new Date(user.school.validUntil);
      if (now > validUntil) {
        return reply.code(403).send({
          error: "School license expired. Please contact Super Admin.",
          isSchoolExpired: true,
          validUntil: user.school.validUntil
        });
      }

      const token = jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolNumber: user.school.schoolNumber
      }, JWT_SECRET);

      return {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          schoolName: user.school.name,
          studentId: user.studentId
        }
      };
    }

    // Teacher Login: Use email + password (no school number)
    if (role === "TEACHER") {
      if (!email) return reply.code(400).send({ error: "Email is required" });

      const user = await prisma.user.findFirst({
        where: {
          email,
          role: "TEACHER"
        },
        include: { school: true }
      });

      if (!user) {
        return reply.code(404).send({ error: "Email can't be found" });
      }
      if (!user.isActive) {
        return reply.code(403).send({ error: "Account inactive. Please contact admin." });
      }
      if (!(await bcrypt.compare(password, user.password))) {
        return reply.code(401).send({ error: "Incorrect password" });
      }

      // Check School Validity
      const now = new Date();
      const validUntil = new Date(user.school.validUntil);
      if (now > validUntil) {
        return reply.code(403).send({
          error: "School license expired. Please contact Super Admin.",
          isSchoolExpired: true,
          validUntil: user.school.validUntil
        });
      }

      const token = jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolNumber: user.school.schoolNumber
      }, JWT_SECRET);

      return {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          schoolName: user.school.name
        }
      };
    }

    // Admin Login: Use schoolNumber + email + password
    if (role === "ADMIN") {
      if (!schoolNumber) return reply.code(400).send({ error: "School number is required" });
      if (!email) return reply.code(400).send({ error: "Email is required" });

      // Check school first
      const school = await prisma.school.findUnique({
        where: { schoolNumber }
      });
      if (!school) {
        return reply.code(404).send({ error: "School ID can't be found" });
      }

      const user = await prisma.user.findFirst({
        where: {
          email,
          role: "ADMIN",
          schoolId: school.id
        },
        include: { school: true }
      });
      if (!user) {
        return reply.code(404).send({ error: "Email can't be found" });
      }
      if (!user.isActive) {
        return reply.code(403).send({ error: "Account inactive. Please contact admin." });
      }
      if (!(await bcrypt.compare(password, user.password))) {
        return reply.code(401).send({ error: "Incorrect password" });
      }

      // Check School Validity
      const now = new Date();
      const validUntil = new Date(user.school.validUntil);
      if (now > validUntil) {
        return reply.code(403).send({
          error: "School license expired. Please contact Super Admin.",
          isSchoolExpired: true,
          validUntil: user.school.validUntil
        });
      }

      const token = jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolNumber: user.school.schoolNumber
      }, JWT_SECRET);

      return {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          schoolName: user.school.name
        }
      };
    }

    return reply.code(400).send({ error: "Invalid role specified" });
  });

  // Verify 2FA Endpoint
  app.post("/api/auth/superadmin/verify-2fa", async (request, reply) => {
    const { email, code } = request.body;

    try {
      const user = await prisma.user.findFirst({
        where: { email, role: "SUPERADMIN" }
      });

      if (!user || user.twoFactorCode !== code || new Date() > new Date(user.twoFactorExpires)) {
        return reply.code(400).send({ error: "Invalid or expired 2FA code" });
      }

      // Clear code
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorCode: null, twoFactorExpires: null }
      });

      const token = jwt.sign({ id: user.id, email: user.email, role: "SUPERADMIN" }, JWT_SECRET);
      return { token, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: "SUPERADMIN" } };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "2FA verification failed" });
    }
  });

  // --- Super Admin Routes ---

  // Create School
  app.post("/api/superadmin/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });

    const { name, address, phone, email, maxStudents, maxTeachers, adminEmail, adminPassword, adminFirstName, adminLastName } = request.body;

    try {
      const schoolNumber = await generateSchoolNumber();
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // Calculate validUntil (4 months from now)
      // Note: DB also handles default, but explicit setting ensures consistency in application logic if needed
      // We will rely on DB default or set it here if we want to be explicit. 
      // Using DB default as defined in schema: @default(dbgenerated("NOW() + interval '4 months'"))
      // So no need to pass validUntil unless we want to override.

      const school = await prisma.school.create({
        data: {
          name,
          address,
          phone,
          email,
          schoolNumber,
          maxStudents: parseInt(maxStudents) || 100,
          maxTeachers: parseInt(maxTeachers) || 10,
          users: {
            create: {
              email: adminEmail,
              password: hashedPassword,
              firstName: adminFirstName,
              lastName: adminLastName,
              role: "ADMIN"
            }
          }
        },
        include: { users: true }
      });

      return school;
    } catch (err) {
      if (err.code === 'P2002') {
        return reply.code(400).send({ error: "Email or School Number already exists" });
      }
      app.log.error(err);
      return reply.code(500).send({ error: "Internal server error during school creation" });
    }
  });

  // List All Administrators (Global)
  app.get("/api/superadmin/admins", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });

    try {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        include: { school: true },
        orderBy: { createdAt: 'desc' }
      });
      return admins;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch administrators" });
    }
  });

  // Update Student/Teacher
  app.put("/api/admin/users/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { id } = request.params;
    const { firstName, lastName, phone, address, studentClass, subjects, password } = request.body;
    const schoolId = request.user.role === "SUPERADMIN" ? request.body.schoolId : request.user.schoolId;

    try {
      // Ensure user belongs to the same school (if ADMIN)
      const existingUser = await prisma.user.findUnique({ where: { id } });

      if (!existingUser) return reply.code(404).send({ error: "User not found" });
      if (request.user.role === "ADMIN" && existingUser.schoolId !== schoolId) {
        return reply.code(403).send({ error: "Forbidden: User belongs to another school" });
      }

      const updateData = {
        firstName,
        lastName,
        phone,
        address,
        studentClass,
        subjects
      };

      if (password && password.trim() !== "") {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData
      });

      return updatedUser;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update user" });
    }
  });

  // Get Super Admin Profile
  app.get("/api/superadmin/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true }
      });
      return user;
    } catch (err) {
      return reply.code(500).send({ error: "Failed to fetch profile" });
    }
  });

  // Update Super Admin Profile
  app.put("/api/superadmin/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { firstName, lastName, email } = request.body;
    try {
      const user = await prisma.user.update({
        where: { id: request.user.id },
        data: { firstName, lastName, email }
      });
      return { message: "Profile updated successfully", user: { firstName: user.firstName, lastName: user.lastName, email: user.email } };
    } catch (err) {
      return reply.code(500).send({ error: "Failed to update profile" });
    }
  });

  // Change Password
  app.post("/api/superadmin/change-password", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { currentPassword, newPassword } = request.body;
    try {
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        return reply.code(400).send({ error: "Incorrect current password" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: request.user.id },
        data: { password: hashedPassword }
      });
      return { message: "Password updated successfully" };
    } catch (err) {
      return reply.code(500).send({ error: "Failed to change password" });
    }
  });

  // Reactivate School
  app.post("/api/superadmin/schools/:id/reactivate", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;

    try {
      const school = await prisma.school.findUnique({ where: { id } });
      if (!school) return reply.code(404).send({ error: "School not found" });

      // Extend validity by 4 months from NOW
      const now = new Date();
      const validUntil = new Date(now.setMonth(now.getMonth() + 4));

      const updatedSchool = await prisma.school.update({
        where: { id },
        data: {
          validUntil,
          lastReactivatedAt: new Date()
        }
      });

      return {
        message: "School reactivated successfully",
        school: updatedSchool
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to reactivate school" });
    }
  });

  // Delete School
  app.delete("/api/superadmin/schools/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;
    try {
      await prisma.school.delete({ where: { id } });
      return { message: "School deleted successfully" };
    } catch (err) {
      return reply.code(500).send({ error: "Failed to delete school" });
    }
  });

  // List Schools
  app.get("/api/superadmin/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "SUPERADMIN") return reply.code(403).send({ error: "Forbidden" });

    const schools = await prisma.school.findMany({
      include: { _count: { select: { users: true } } }
    });

    // We can compute status here or in frontend. 
    // Frontend is better for display logic (e.g. expiring soon warning relative to client time), 
    // but we have validUntil in the data now.

    return schools;
  });

  // --- School Admin Routes ---

  // Add User (Admin/Teacher/Student)
  app.post("/api/admin/users", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { email, password, firstName, lastName, role, phone, address, schoolId: targetSchoolId, studentClass, subjects } = request.body;
    const schoolId = request.user.role === "SUPERADMIN" ? targetSchoolId : request.user.schoolId;

    if (!schoolId) return reply.code(400).send({ error: "School ID is required" });

    // Check Quotas
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: { _count: { select: { users: { where: { role } } } } }
    });

    if (role === "TEACHER" && school._count.users >= school.maxTeachers) {
      return reply.code(400).send({ error: "Teacher limit reached" });
    }
    if (role === "STUDENT" && school._count.users >= school.maxStudents) {
      return reply.code(400).send({ error: "Student limit reached" });
    }
    // Admins don't have a specific quota check here currently, 
    // but they are assigned to the school.

    // Generate student ID for students
    // Generate student ID for students
    let studentId = null;
    if (role === "STUDENT") {
      let unique = false;
      while (!unique) {
        const randomDigits = Math.floor(1000 + Math.random() * 9000).toString(); // 4 random digits
        studentId = `${school.schoolNumber}${randomDigits}`;

        const existing = await prisma.user.findUnique({ where: { studentId } });
        if (!existing) unique = true;
      }
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role,
          phone,
          address,
          school: { connect: { id: schoolId } },
          studentId,
          studentClass,
          subjects
        }
      });

      return user;
    } catch (err) {
      if (err.code === 'P2002') {
        return reply.code(400).send({ error: "Email already exists" });
      }
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to create user" });
    }
  });

  // Bulk Add Students (CSV Upload)
  app.post("/api/admin/users/bulk", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { students, schoolId: targetSchoolId } = request.body; // students is array of objects
    const schoolId = request.user.role === "SUPERADMIN" ? targetSchoolId : request.user.schoolId;

    if (!schoolId) return reply.code(400).send({ error: "School ID is required" });
    if (!students || !Array.isArray(students) || students.length === 0) {
      return reply.code(400).send({ error: "No students provided" });
    }

    // Check Quota
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: { _count: { select: { users: { where: { role: "STUDENT" } } } } }
    });

    if (school._count.users + students.length > school.maxStudents) {
      return reply.code(400).send({ error: `Cannot add ${students.length} students. Limit reached. Remaining slots: ${school.maxStudents - school._count.users}` });
    }

    const createdStudents = [];
    const errors = [];

    for (const student of students) {
      try {
        const { email, password, firstName, lastName, studentClass, phone, address, gender } = student;

        if (!email || !password || !firstName || !lastName || !studentClass) {
          errors.push({ email, error: "Missing required fields" });
          continue;
        }

        // Generate ID
        let unique = false;
        let studentId = "";
        while (!unique) {
          const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
          studentId = `${school.schoolNumber}${randomDigits}`;
          const existing = await prisma.user.findUnique({ where: { studentId } });
          if (!existing) unique = true;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            firstName,
            lastName,
            role: "STUDENT",
            studentClass,
            studentId,
            schoolId,
            phone,
            address,
            // gender - if we add gender to schema later
          }
        });

        createdStudents.push({ email, studentId });
      } catch (err) {
        if (err.code === 'P2002') {
          errors.push({ email: student.email, error: "Email already exists" });
        } else {
          errors.push({ email: student.email, error: "Failed to create" });
          app.log.error(err);
        }
      }
    }

    return {
      message: `Processed ${students.length} students`,
      successCount: createdStudents.length,
      failureCount: errors.length,
      created: createdStudents,
      errors
    };
  });

  // Get Stats
  app.get("/api/admin/stats", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const schoolId = request.user.schoolId;

    const teacherCount = await prisma.user.count({ where: { schoolId, role: "TEACHER" } });
    const studentCount = await prisma.user.count({ where: { schoolId, role: "STUDENT" } });

    return { teacherCount, studentCount };
  });

  // List Users by Role
  app.get("/api/admin/users/:role", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { role } = request.params;
    const { schoolId: querySchoolId } = request.query;
    const schoolId = request.user.role === "SUPERADMIN" ? querySchoolId : request.user.schoolId;

    if (!schoolId) return reply.code(400).send({ error: "School ID is required" });

    if (!["ADMIN", "TEACHER", "STUDENT"].includes(role)) {
      return reply.code(400).send({ error: "Invalid role" });
    }

    const users = await prisma.user.findMany({
      where: { schoolId, role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        studentId: true,
        studentClass: true,
        subjects: true
      }
    });

    return users;
  });

  // Get Subjects
  app.get("/api/admin/subjects", { preHandler: [app.authenticate] }, async (request, reply) => {
    // Authenticate but allow any role with access to this data (probably Teacher/Admin/SuperAdmin)
    // Actually, Student probably doesn't need this full list unless they are choosing electives.
    // Spec says "Admin should be able to see...", so Admin/Teacher context usually.
    // I'll allow all authenticated for now as it's just a reference list.

    const subjects = await prisma.subject.findMany({
      orderBy: [
        { section: 'asc' },
        { category: 'asc' },
        { name: 'asc' }
      ]
    });
    return subjects;
  });

  // Add Subject
  app.post("/api/admin/subjects", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN' && request.user.role !== 'SUPERADMIN') {
      return reply.code(403).send({ error: "Access denied" });
    }

    const { name, section, category } = request.body;

    if (!name || !section) {
      return reply.code(400).send({ error: "Name and Section are required" });
    }

    try {
      const subject = await prisma.subject.create({
        data: {
          name,
          section: section.toUpperCase(),
          category: category || "General"
        }
      });
      return subject;
    } catch (err) {
      if (err.code === 'P2002') {
        return reply.code(400).send({ error: "Subject name already exists" });
      }
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to create subject" });
    }
  });

  // Delete Subject
  app.delete("/api/admin/subjects/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN' && request.user.role !== 'SUPERADMIN') {
      return reply.code(403).send({ error: "Access denied" });
    }

    const { id } = request.params;

    try {
      await prisma.subject.delete({
        where: { id }
      });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to delete subject" });
    }
  });

  // Get Enrollment Trend
  app.get("/api/admin/enrollment-trend", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const schoolId = request.user.schoolId;

    try {
      // Get all students for this school
      const students = await prisma.user.findMany({
        where: { schoolId, role: "STUDENT" },
        select: { createdAt: true }
      });

      // Group by month for the last 12 months
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const enrollmentData = [];

      for (let i = 11; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

        const count = students.filter(s => {
          const createdDate = new Date(s.createdAt);
          return createdDate >= monthStart && createdDate <= monthEnd;
        }).length;

        enrollmentData.push({
          month: monthNames[targetDate.getMonth()],
          count
        });
      }

      return { enrollmentData };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch enrollment trend" });
    }
  });

  // Bulk Promote/Demote Students
  app.post("/api/admin/users/bulk-promote", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { studentIds, newClass } = request.body;
    const schoolId = request.user.schoolId;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return reply.code(400).send({ error: "Student IDs array is required" });
    }

    if (!newClass) {
      return reply.code(400).send({ error: "New class is required" });
    }

    try {
      // Verify all students belong to this school
      const students = await prisma.user.findMany({
        where: {
          id: { in: studentIds },
          schoolId,
          role: "STUDENT"
        }
      });

      if (students.length !== studentIds.length) {
        return reply.code(400).send({ error: "Some students not found or don't belong to your school" });
      }

      // Update all students
      const result = await prisma.user.updateMany({
        where: {
          id: { in: studentIds },
          schoolId
        },
        data: {
          studentClass: newClass
        }
      });

      return {
        message: `Successfully updated ${result.count} students to ${newClass}`,
        count: result.count
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to bulk promote students" });
    }
  });

  // --- Exam Schedule Routes ---

  // Admin - Question Readiness: which subjects have questions set by teachers
  app.get("/api/admin/exams/question-readiness", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;

    try {
      // Get all exam questions grouped by subject + class, with teacher info
      const questions = await prisma.examQuestion.groupBy({
        by: ['subject', 'class', 'teacherId'],
        where: { schoolId },
        _count: { id: true }
      });

      // Get teacher names
      const teacherIds = [...new Set(questions.map(q => q.teacherId))];
      const teachers = await prisma.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, firstName: true, lastName: true }
      });
      const teacherMap = Object.fromEntries(teachers.map(t => [t.id, `${t.firstName} ${t.lastName}`]));

      // Build summary: group by subject+class
      const summary = {};
      questions.forEach(q => {
        const key = `${q.subject}|${q.class}`;
        if (!summary[key]) {
          summary[key] = {
            subject: q.subject,
            class: q.class,
            totalQuestions: 0,
            teachers: []
          };
        }
        summary[key].totalQuestions += q._count.id;
        summary[key].teachers.push({
          name: teacherMap[q.teacherId] || 'Unknown',
          count: q._count.id
        });
      });

      return Object.values(summary);
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch question readiness" });
    }
  });

  // List Exam Schedules
  app.get("/api/admin/exams", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;

    try {
      const exams = await prisma.examSchedule.findMany({
        where: { schoolId },
        orderBy: { date: 'asc' }
      });
      return exams;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch exam schedules" });
    }
  });

  // Create Exam Schedule
  app.post("/api/admin/exams", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;
    const { subject, class: studentClass, date, time, duration, type } = request.body;

    try {
      const exam = await prisma.examSchedule.create({
        data: {
          subject,
          class: studentClass,
          date,
          time,
          duration,
          type,
          schoolId
        }
      });

      // Auto-assign the term ONLY to existing questions for this subject+class that do not already have a term
      await prisma.examQuestion.updateMany({
        where: { schoolId, subject, class: studentClass, term: "" },
        data: { term: type }
      });

      return exam;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to create exam schedule", details: err.message });
    }
  });

  // Update Exam Schedule
  app.put("/api/admin/exams/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { id } = request.params;
    const schoolId = request.user.schoolId;
    const { subject, class: studentClass, date, time, duration, type } = request.body;

    try {
      const existingExam = await prisma.examSchedule.findUnique({ where: { id } });
      if (!existingExam || existingExam.schoolId !== schoolId) {
        return reply.code(404).send({ error: "Exam schedule not found" });
      }

      const updatedExam = await prisma.examSchedule.update({
        where: { id },
        data: {
          subject,
          class: studentClass,
          date,
          time,
          duration,
          type
        }
      });

      // Update existing questions for this subject+class that do not already have a term
      await prisma.examQuestion.updateMany({
        where: { schoolId, subject, class: studentClass, term: "" },
        data: { term: type }
      });

      return updatedExam;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update exam schedule" });
    }
  });

  // Delete Exam Schedule
  app.delete("/api/admin/exams/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { id } = request.params;
    const schoolId = request.user.schoolId;

    try {
      const existingExam = await prisma.examSchedule.findUnique({ where: { id } });
      if (!existingExam || existingExam.schoolId !== schoolId) {
        return reply.code(404).send({ error: "Exam schedule not found" });
      }

      await prisma.examSchedule.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to delete exam schedule" });
    }
  });

  // --- Grading System Routes ---

  // List Grading Rules
  app.get("/api/admin/grading", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;

    try {
      const grading = await prisma.gradingSystem.findMany({
        where: { schoolId },
        orderBy: { minScore: 'desc' }
      });
      return grading;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch grading system" });
    }
  });

  // Add Grading Rule
  app.post("/api/admin/grading", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;
    const { grade, minScore, maxScore, remark } = request.body;

    try {
      const newGrade = await prisma.gradingSystem.create({
        data: {
          grade,
          minScore: parseInt(minScore),
          maxScore: parseInt(maxScore),
          remark,
          schoolId
        }
      });
      return newGrade;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to create grading rule" });
    }
  });

  // Update Grading Rule
  app.put("/api/admin/grading/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { id } = request.params;
    const schoolId = request.user.schoolId;
    const { grade, minScore, maxScore, remark } = request.body;

    try {
      const updatedGrade = await prisma.gradingSystem.update({
        where: { id, schoolId },
        data: {
          grade,
          minScore: parseInt(minScore),
          maxScore: parseInt(maxScore),
          remark
        }
      });
      return updatedGrade;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update grading rule" });
    }
  });

  // Delete Grading Rule
  app.delete("/api/admin/grading/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { id } = request.params;
    const schoolId = request.user.schoolId;

    try {
      await prisma.gradingSystem.delete({
        where: { id, schoolId }
      });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to delete grading rule" });
    }
  });

  // --- Student Results Routes ---

  // Record Student Result
  app.post("/api/admin/results", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "TEACHER" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;
    const { studentId, subject, marks, term, class: studentClass } = request.body;

    try {
      const result = await prisma.studentResult.create({
        data: {
          studentId,
          subject,
          marks: parseFloat(marks),
          term,
          class: studentClass,
          schoolId
        }
      });
      return result;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to record student result" });
    }
  });

  // List Student Results (for Admin/Teacher)
  app.get("/api/admin/results", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN" && request.user.role !== "TEACHER" && request.user.role !== "SUPERADMIN") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const schoolId = request.user.schoolId;
    const { studentClass, term, subject } = request.query;

    const where = { schoolId };
    if (studentClass) where.class = studentClass;
    if (term) where.term = term;
    if (subject) where.subject = subject;

    try {
      const results = await prisma.studentResult.findMany({
        where,
        include: {
          student: {
            select: { firstName: true, lastName: true, studentId: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return results;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch student results" });
    }
  });

  // --- Settings & Profile Routes (Admin) ---

  // Get School Details
  app.get("/api/admin/school", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const schoolId = request.user.schoolId;

    try {
      const school = await prisma.school.findUnique({
        where: { id: schoolId }
      });
      return school;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch school details" });
    }
  });

  // Update School Details
  app.put("/api/admin/school", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const schoolId = request.user.schoolId;
    const { name, address, phone, email } = request.body;

    try {
      const updatedSchool = await prisma.school.update({
        where: { id: schoolId },
        data: { name, address, phone, email }
      });
      return updatedSchool;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update school details" });
    }
  });

  // Get Admin Profile
  app.get("/api/admin/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });

    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, address: true, createdAt: true }
      });
      return user;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch profile" });
    }
  });

  // Update Admin Profile
  app.put("/api/admin/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { firstName, lastName, phone, address, email } = request.body;

    try {
      const user = await prisma.user.update({
        where: { id: request.user.id },
        data: { firstName, lastName, phone, address, email }
      });
      return { message: "Profile updated successfully", user: { firstName: user.firstName, lastName: user.lastName, email: user.email } };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update profile" });
    }
  });

  // Change Admin Password
  app.post("/api/admin/change-password", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { currentPassword, newPassword } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        return reply.code(400).send({ error: "Incorrect current password" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: request.user.id },
        data: { password: hashedPassword }
      });
      return { message: "Password updated successfully" };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to change password" });
    }
  });

  // --- Teacher Specialized Routes ---

  // Get Students Offering Teacher's Subjects
  app.get("/api/teacher/students", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { subject } = request.query;
    const schoolId = request.user.schoolId;

    try {
      // Get teacher's subjects
      const teacher = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { subjects: true }
      });

      if (!teacher || !teacher.subjects || teacher.subjects.length === 0) {
        return [];
      }

      // Determine which subjects to filter by
      const filterSubjects = subject ? [subject] : teacher.subjects;

      // Find students in the same school who offer at least one of these subjects
      const students = await prisma.user.findMany({
        where: {
          schoolId,
          role: "STUDENT",
          isActive: true,
          subjects: {
            hasSome: filterSubjects
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          studentId: true,
          studentClass: true,
          subjects: true,
          phone: true,
          address: true
        },
        orderBy: [
          { studentClass: 'asc' },
          { lastName: 'asc' }
        ]
      });

      return {
        students,
        teacherSubjects: teacher.subjects
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch students" });
    }
  });

  // --- Teacher Tool Routes ---

  // Lesson Notes
  app.get("/api/teacher/lesson-notes", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER" && request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const teacherId = request.user.id;
    try {
      const notes = await prisma.lessonNote.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'desc' }
      });
      return notes;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch lesson notes" });
    }
  });

  app.post("/api/teacher/lesson-notes", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { subject, topic, content, class: studentClass } = request.body;
    try {
      const note = await prisma.lessonNote.create({
        data: {
          subject,
          topic,
          content,
          class: studentClass,
          teacherId: request.user.id,
          schoolId: request.user.schoolId
        }
      });
      return note;
    } catch (err) {
      console.error("LessonNote Create Error:", err);
      app.log.error(err);
      return reply.code(500).send({ error: `Failed to create lesson note: ${err.message}` });
    }
  });

  app.put("/api/teacher/lesson-notes/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;
    const { subject, topic, content, class: studentClass } = request.body;
    try {
      const note = await prisma.lessonNote.update({
        where: { id, teacherId: request.user.id },
        data: { subject, topic, content, class: studentClass }
      });
      return note;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update lesson note" });
    }
  });

  app.delete("/api/teacher/lesson-notes/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;
    try {
      await prisma.lessonNote.delete({
        where: { id, teacherId: request.user.id }
      });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to delete lesson note" });
    }
  });

  // AI Lesson Note Generation (Placeholder/Mock)
  app.post("/api/teacher/lesson-notes/generate", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { subject, topic, class: studentClass } = request.body;

    try {
      // Mocking AI response for now. In a real scenario, we'd call OpenAI/DeepSeek API here.
      const aiContent = `
        <h3>Lesson Plan: ${topic} (${subject})</h3>
        <p><strong>Objective:</strong> Students will understand the core concepts of ${topic}.</p>
        <p><strong>Outline:</strong></p>
        <ul>
          <li>Introduction to ${topic}</li>
          <li>Key Mechanisms and Principles</li>
          <li>Real-world applications</li>
          <li>Conclusion and Review</li>
        </ul>
        <p>This note was generated via AI based on your topic and subject for ${studentClass}.</p>
      `;

      return { content: aiContent };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "AI Generation failed" });
    }
  });

  // Gemini AI Chat
  app.post("/api/teacher/ai/chat", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { message } = request.body;

    try {
      const prompt = `You are a professional educational assistant for a school management system. 
      Help the teacher with their request: "${message}". 
      If they want a lesson note, provide a structured note with Introduction, Core Content, and Summary.
      If they want exam questions, provide clear and challenging questions.
      Keep the tone professional and helpful.`;

      const text = await generateAiContent(prompt);
      return { reply: text };
    } catch (err) {
      console.error("AI Chat Error:", err);
      return reply.code(500).send({ error: `AI Error: ${err.message || "Unknown error"}. Please try again.` });
    }
  });

  // Teacher Data (Subjects & Classes)
  app.get("/api/teacher/my-data", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      // Get teacher's subjects
      const teacher = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { subjects: true, schoolId: true }
      });

      const schoolId = teacher?.schoolId;
      const teacherSubjects = teacher?.subjects || [];

      // 1. Fetch unique classes from students in this school
      const userClasses = await prisma.user.findMany({
        where: { 
          schoolId,
          role: 'STUDENT',
          studentClass: { not: null }
        },
        select: { studentClass: true },
        distinct: ['studentClass']
      });

      // 2. Fetch unique classes from actual exam results for teacher's subjects
      const resultClasses = await prisma.studentResult.findMany({
        where: {
          schoolId,
          subject: { in: teacherSubjects }
        },
        select: { class: true },
        distinct: ['class']
      });

      // Combine and unique
      const combinedClasses = Array.from(new Set([
        ...userClasses.map(c => c.studentClass),
        ...resultClasses.map(c => c.class)
      ])).sort();

      return {
        subjects: teacherSubjects,
        classes: combinedClasses
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch teacher data" });
    }
  });

  // Teacher Dashboard Stats
  app.get("/api/teacher/dashboard-stats", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      const teacherId = request.user.id;
      const schoolId = request.user.schoolId;

      // Get teacher's subjects
      const teacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { subjects: true }
      });

      const subjects = teacher?.subjects || [];

      // 1. Student Count (Students who offer at least one of teacher's subjects)
      const studentCount = await prisma.user.count({
        where: {
          schoolId,
          role: "STUDENT",
          isActive: true,
          subjects: {
            hasSome: subjects
          }
        }
      });

      // 2. Lesson Notes Count
      const lessonNotesCount = await prisma.lessonNote.count({
        where: { teacherId }
      });

      // 3. Assignments Count
      const assignmentsCount = await prisma.assignment.count({
        where: { teacherId }
      });

      // 4. Classes Today (Mocked or based on ExamSchedule if applicable)
      // For now, let's just return counts for the main stats.
      // We can add more specific logic if needed.

      return {
        studentCount,
        lessonNotesCount,
        assignmentsCount,
        classesTodayCount: 0 // Placeholder for now
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Assignments
  app.get("/api/teacher/assignments", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER" && request.user.role !== "ADMIN" && request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { class: studentClass } = request.query;
    const where = { schoolId: request.user.schoolId };

    if (request.user.role === "TEACHER") {
      where.teacherId = request.user.id;
    } else if (request.user.role === "STUDENT") {
      where.class = request.user.studentClass;
    } else if (studentClass) {
      where.class = studentClass;
    }

    try {
      const assignments = await prisma.assignment.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });
      return assignments;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch assignments" });
    }
  });

  app.post("/api/teacher/assignments", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { title, description, dueDate, class: studentClass, subject } = request.body;
    try {
      const assignment = await prisma.assignment.create({
        data: {
          title,
          description,
          dueDate: new Date(dueDate),
          class: studentClass,
          subject,
          teacherId: request.user.id,
          schoolId: request.user.schoolId
        }
      });
      return assignment;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to create assignment" });
    }
  });

  // Teacher Awards - Student Rankings by Subject and Class
  app.get("/api/teacher/awards", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      const teacher = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { subjects: true }
      });

      const subjects = teacher?.subjects || [];
      if (subjects.length === 0) return [];

      const { subject, class: studentClass, term } = request.query;

      const where = {
        schoolId: request.user.schoolId,
        subject: subject ? subject : { in: subjects }
      };
      if (studentClass) where.class = studentClass;
      if (term) where.term = term;

      const results = await prisma.studentResult.findMany({
        where,
        include: {
          student: {
            select: { firstName: true, lastName: true, studentId: true, studentClass: true }
          }
        },
        orderBy: { marks: 'desc' }
      });

      return results;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch awards data" });
    }
  });

  // Teacher - Get Detailed Student Submission (with answers)
  app.get("/api/teacher/awards/result/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      const { id } = request.params;
      const result = await prisma.studentResult.findUnique({
        where: { id },
        include: {
          student: {
            select: { firstName: true, lastName: true, studentId: true, studentClass: true }
          },
          answers: {
            include: {
              question: true
            }
          }
        }
      });

      if (!result) return reply.code(404).send({ error: "Result not found" });

      return result;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch submission details" });
    }
  });

  // Teacher - Update Theory Grades, Test Score and Recalculate Total Score
  app.post("/api/teacher/awards/grade", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      const { resultId, theoryGrades, testScore } = request.body; // theoryGrades: [ { answerId, marks } ]

      if (!resultId) {
        return reply.code(400).send({ error: "Invalid payload. Need resultId." });
      }

      // 1. Update each theory answer's marks (if provided)
      if (Array.isArray(theoryGrades)) {
        const updatePromises = theoryGrades.map(g => {
          return prisma.studentAnswer.update({
            where: { id: g.answerId },
            data: { marks: parseFloat(g.marks) || 0 }
          });
        });
        await Promise.all(updatePromises);
      }

      // 2. Fetch the full result with all answers and questions to recalculate total
      const result = await prisma.studentResult.findUnique({
        where: { id: resultId },
        include: {
          answers: {
            include: { question: true }
          }
        }
      });

      if (!result) return reply.code(404).send({ error: "Result not found" });

      // 3. Update testScore if provided
      const finalTestScore = testScore !== undefined ? parseFloat(testScore) : result.testScore;

      // 4. Recalculate total score
      let newTotalScore = 0;

      for (const ans of result.answers) {
        if (ans.question.type === 'MCQ') {
          // Re-verify MCQ correctness
          const studentAnswer = ans.answerText || "";
          const answerLetter = (ans.question.answer || "").toUpperCase().trim();
          const optionIndex = answerLetter.charCodeAt(0) - 65;
          const correctOptionText = ans.question.options[optionIndex];

          if (correctOptionText) {
            if (studentAnswer.trim().toLowerCase() === correctOptionText.trim().toLowerCase()) {
              newTotalScore += ans.question.marks || 1;
            }
          } else {
            // Fallback
            if (studentAnswer.trim().toLowerCase() === ans.question.answer.trim().toLowerCase()) {
              newTotalScore += ans.question.marks || 1;
            }
          }
        } else if (ans.question.type === 'THEORY') {
          // For theory, use the marks stored (which might have been updated above)
          const updatedAns = Array.isArray(theoryGrades) 
            ? theoryGrades.find(tg => tg.answerId === ans.id)
            : null;
          newTotalScore += updatedAns ? parseFloat(updatedAns.marks) : (ans.marks || 0);
        }
      }

      // Add the test score to the final marks
      newTotalScore += finalTestScore;

      // 5. Update the StudentResult with the new total score and test score
      const updatedResult = await prisma.studentResult.update({
        where: { id: resultId },
        data: { 
          marks: newTotalScore,
          testScore: finalTestScore
        }
      });

      return { success: true, newTotalScore: updatedResult.marks };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update grades" });
    }
  });

  // Teacher - Get Exam Schedules (filtered to teacher's subjects)
  app.get("/api/teacher/exams", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });

    try {
      const teacher = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { subjects: true }
      });

      const subjects = teacher?.subjects || [];

      const exams = await prisma.examSchedule.findMany({
        where: {
          schoolId: request.user.schoolId,
          ...(subjects.length > 0 ? { subject: { in: subjects } } : {})
        },
        orderBy: { date: 'asc' }
      });

      return exams;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch exam schedules" });
    }
  });

  // Exam Questions
  app.get("/api/teacher/exams/questions", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER" && request.user.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden" });
    const { subject, class: studentClass, term } = request.query;
    const where = { schoolId: request.user.schoolId };
    if (subject) where.subject = subject;
    if (studentClass) where.class = studentClass;
    if (term) where.term = term;

    try {
      const questions = await prisma.examQuestion.findMany({
        where,
        orderBy: { createdAt: 'asc' }
      });
      return questions;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch exam questions" });
    }
  });

  app.post("/api/teacher/exams/questions", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { subject, class: studentClass, type, question, options, answer, marks, term } = request.body;
    console.log("Exam Question Create Request:", { subject, studentClass, type, term });

    try {
      const examQuestion = await prisma.examQuestion.create({
        data: {
          subject,
          class: studentClass,
          type,
          question,
          options,
          answer,
          marks: parseFloat(marks) || 1.0,
          term: term || "", // Default to empty string (unassigned term)
          teacherId: request.user.id,
          schoolId: request.user.schoolId
        }
      });
      console.log("Exam Question Created Successfully:", examQuestion.id);
      return examQuestion;
    } catch (err) {
      console.error("Exam Question Create Error:", err);
      return reply.code(500).send({ error: `Failed to create exam question: ${err.message}` });
    }
  });

  app.put("/api/teacher/exams/questions/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;
    const { subject, class: studentClass, type, question, options, answer, marks, term } = request.body;
    try {
      const examQuestion = await prisma.examQuestion.update({
        where: { id, teacherId: request.user.id },
        data: { subject, class: studentClass, type, question, options, answer, marks: parseFloat(marks) || 1.0, term: term || "First Term" }
      });
      return examQuestion;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to update exam question" });
    }
  });

  app.delete("/api/teacher/exams/questions/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { id } = request.params;
    try {
      await prisma.examQuestion.delete({
        where: { id, teacherId: request.user.id }
      });
      return { success: true };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to delete exam question" });
    }
  });

  app.post("/api/teacher/exams/questions/bulk-delete", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: "No IDs provided" });
    }

    try {
      const result = await prisma.examQuestion.deleteMany({
        where: {
          id: { in: ids },
          teacherId: request.user.id
        }
      });
      return { success: true, count: result.count };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to bulk delete exam questions" });
    }
  });

  // Bulk Upload Exam Questions (DOCX)
  app.post("/api/teacher/exams/bulk-upload", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "TEACHER") return reply.code(403).send({ error: "Forbidden" });
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });

    try {
      const buffer = await data.toBuffer();
      // Use convertToHtml to keep bold/underline markers
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;

      const prompt = `
        Extract exam questions from the following HTML content of a document.
        Return ONLY a valid JSON array of objects. Do not include any markdown formatting like \`\`\`json.
        
        Each object in the array must follow this schema:
        {
          "question": "The text of the question",
          "type": "MCQ" or "THEORY",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "A" (for MCQ, identify the letter based on bold/underline/content. for THEORY, leave this as an empty string ""),
          "marks": 1
        }

        Rules:
        1. If a question has options, it is "MCQ". Extract all options into the array.
        2. Identify the correct answer for MCQ. Frequently, the correct option is <strong>bolded</strong> or <u>underlined</u> in the document.
        3. If there are no options, it is "THEORY". For THEORY questions, the answer field MUST be an empty string "".
        4. Ignore document headers, school names, dates, or general instructions.
        5. Combine multi-line questions into a single string.

        HTML Content:
        ${html}
      `;

      let text = await generateAiContent(prompt);

      // Clean AI response if it contains markdown markers
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      const questions = JSON.parse(text);
      console.log(`AI parsed ${questions.length} questions.`);

      const { subject, class: studentClass, term } = request.query;


      const savedQuestions = [];

      for (const q of questions) {
        try {
          const saved = await prisma.examQuestion.create({
            data: {
              subject: subject || "Imported",
              class: studentClass || "All",
              term: term || "First Term",
              type: q.type || "MCQ",
              question: q.question,
              options: q.options || [],
              answer: q.answer || "",
              marks: parseFloat(q.marks) || 1.0,
              teacherId: request.user.id,
              schoolId: request.user.schoolId
            }
          });
          savedQuestions.push(saved);
        } catch (dbErr) {
          console.error("DB Save failed for AI extracted question:", dbErr);
        }
      }

      return { success: true, questions: savedQuestions };
    } catch (err) {
      console.error("AI Bulk upload error:", err);
      return reply.code(500).send({ error: "Failed to parse questions using AI. Please try again." });
    }
  });

  // --- Student/Parent Routes ---

  // Get Student Profile (for parents)
  app.get("/api/student/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const student = await prisma.user.findUnique({
        where: { id: request.user.id },
        include: { school: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          address: true,
          createdAt: true,
          createdAt: true,
          studentClass: true,
          subjects: true,
          school: {
            select: {
              name: true,
              schoolNumber: true
            }
          }
        }
      });

      return student;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch student profile" });
    }
  });

  // Get Student Exams
  app.get("/api/student/exams", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const student = await prisma.user.findUnique({
        where: { id: request.user.id }
      });

      if (!student || !student.studentClass) {
        return [];
      }

      const enrolledSubjects = student.subjects || [];

      // Map specific classes to their broad scheduling categories
      const studentClassLower = student.studentClass.toLowerCase();
      const classCategories = [student.studentClass]; // Always include their exact class
      
      if (['ss1', 'ss2', 'ss3'].includes(studentClassLower)) {
        classCategories.push('Senior Secondary');
      } else if (['js1', 'js2', 'js3'].includes(studentClassLower)) {
        classCategories.push('Junior Secondary');
      }

      // Fetch exams for this student's class (or broad category) and subjects
      const exams = await prisma.examSchedule.findMany({
        where: {
          schoolId: request.user.schoolId,
          class: { in: classCategories },
          subject: { in: enrolledSubjects }
        },
        orderBy: [
          { date: 'asc' },
          { time: 'asc' }
        ]
      });

      // Fetch student's existing results to check submission status
      const results = await prisma.studentResult.findMany({
        where: { studentId: request.user.id }
      });

      const examsWithStatus = exams.map(exam => {
        const hasSubmitted = results.some(r => r.subject === exam.subject && r.term === exam.type);
        return {
          ...exam,
          hasSubmitted
        };
      });

      return examsWithStatus;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch student exams" });
    }
  });

  // Get Questions for an Exam
  app.get("/api/student/exams/:id/questions", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const student = await prisma.user.findUnique({ where: { id: request.user.id } });
      const exam = await prisma.examSchedule.findUnique({ where: { id: request.params.id } });

      if (!exam || !student) {
        return reply.code(404).send({ error: "Exam or student not found" });
      }

      // Check if already taken to prevent manual URL retakes
      const existingResult = await prisma.studentResult.findFirst({
        where: {
          studentId: student.id,
          subject: exam.subject,
          term: exam.type,
          class: student.studentClass
        }
      });

      if (existingResult) {
        return reply.code(403).send({ error: "You have already completed this exam." });
      }

      // Generate possible class name variants to match how teachers might have typed it
      const sClass = (student.studentClass || "").toLowerCase();
      const possibleClasses = [student.studentClass];
      
      if (sClass.match(/^ss\d$/)) {
        possibleClasses.push(`SSS ${sClass.replace('ss', '')}`);
        possibleClasses.push(`ss ${sClass.replace('ss', '')}`);
      } else if (sClass.match(/^js\d$/)) {
        possibleClasses.push(`JSS ${sClass.replace('js', '')}`);
        possibleClasses.push(`js ${sClass.replace('js', '')}`);
      }
      
      const rawQuestions = await prisma.examQuestion.findMany({
        where: {
          schoolId: request.user.schoolId,
          subject: exam.subject,
          class: { in: possibleClasses, mode: 'insensitive' },
          term: exam.type
        }
      });

      // Scrub answers before sending to student!
      const safeQuestions = rawQuestions.map(q => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options,
        marks: q.marks
      }));

      // Sort questions: MCQ first, then THEORY. Randomize within each type.
      const sortedQuestions = safeQuestions.sort((a, b) => {
        if (a.type === 'MCQ' && b.type !== 'MCQ') return -1;
        if (a.type !== 'MCQ' && b.type === 'MCQ') return 1;
        // If they are the same type, randomize
        return Math.random() - 0.5;
      });

      return { 
        exam: {
          subject: exam.subject,
          duration: exam.duration,
          type: exam.type,
          class: exam.class
        },
        questions: sortedQuestions
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch exam questions" });
    }
  });

  // Submit Exam
  app.post("/api/student/exams/:id/submit", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const student = await prisma.user.findUnique({ where: { id: request.user.id } });
      const exam = await prisma.examSchedule.findUnique({ where: { id: request.params.id } });
      
      if (!exam || !student) {
        return reply.code(404).send({ error: "Exam or student not found" });
      }

      // Check if already taken
      const existingResult = await prisma.studentResult.findFirst({
        where: {
          studentId: student.id,
          subject: exam.subject,
          term: exam.type,
          class: student.studentClass
        }
      });

      if (existingResult) {
        return reply.code(400).send({ error: "Exam already submitted" });
      }

      const answers = request.body.answers || {}; // Expecting { questionId: "Selected Option / Text" }

      const possibleClasses = [student.studentClass];
      const sClass = (student.studentClass || "").toLowerCase();
      if (sClass.match(/^ss\d$/)) {
        possibleClasses.push(`SSS ${sClass.replace('ss', '')}`);
        possibleClasses.push(`ss ${sClass.replace('ss', '')}`);
      } else if (sClass.match(/^js\d$/)) {
        possibleClasses.push(`JSS ${sClass.replace('js', '')}`);
        possibleClasses.push(`js ${sClass.replace('js', '')}`);
      }

      const questions = await prisma.examQuestion.findMany({
        where: {
          schoolId: request.user.schoolId,
          subject: exam.subject,
          class: { in: possibleClasses, mode: 'insensitive' },
          term: exam.type
        }
      });

      console.log(`[DEBUG_SUBMIT] Found ${questions.length} questions for subject ${exam.subject}`);

      let totalScore = 0;
      let maxScore = 0;

      for (const q of questions) {
        maxScore += q.marks || 1;
        const studentAnswer = answers[q.id];
        
        console.log(`[DEBUG_SUBMIT] QID: ${q.id}, Type: ${q.type}, StudentAnswer: "${studentAnswer}"`);

        if (!studentAnswer) continue;

        if (q.type === 'MCQ') {
          const answerLetter = (q.answer || "").toUpperCase().trim();
          const optionIndex = answerLetter.charCodeAt(0) - 65;
          const correctOptionText = q.options[optionIndex];
          
          console.log(`[DEBUG_SUBMIT] Correct Letter: ${answerLetter}, Index: ${optionIndex}, CorrectText: "${correctOptionText}"`);

          if (correctOptionText) {
            if (studentAnswer.trim().toLowerCase() === correctOptionText.trim().toLowerCase()) {
              console.log(`[DEBUG_SUBMIT] MATCH! +${q.marks || 1}`);
              totalScore += q.marks || 1;
            } else {
              console.log(`[DEBUG_SUBMIT] NO MATCH. Comparison: "${studentAnswer.trim().toLowerCase()}" vs "${correctOptionText.trim().toLowerCase()}"`);
            }
          } else {
            if (studentAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
              console.log(`[DEBUG_SUBMIT] MATCH (Fallback)!`);
              totalScore += q.marks || 1;
            }
          }
        }
      }

      console.log(`[DEBUG_SUBMIT] Final Score: ${totalScore}/${maxScore}`);

      // Create Result
      const result = await prisma.studentResult.create({
        data: {
          studentId: student.id,
          subject: exam.subject,
          marks: totalScore,
          term: exam.type,
          class: student.studentClass,
          schoolId: student.schoolId
        }
      });

      // Save each answer
      const answerPromises = Object.entries(answers).map(([qId, text]) => {
        return prisma.studentAnswer.create({
          data: {
            resultId: result.id,
            questionId: qId,
            answerText: text
          }
        });
      });
      await Promise.all(answerPromises);

      return { success: true, score: totalScore, maxScore, resultId: result.id };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to submit exam" });
    }
  });

  // Get Student Results
  app.get("/api/student/results", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const results = await prisma.studentResult.findMany({
        where: { studentId: request.user.id },
        orderBy: { createdAt: 'desc' }
      });


      const grading = await prisma.gradingSystem.findMany({
        where: { schoolId: request.user.schoolId },
        orderBy: { minScore: 'desc' }
      });

      return {
        results,
        grading
      };
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: "Failed to fetch results" });
    }
  });

  // Get Student Attendance (placeholder for future attendance system)
  app.get("/api/student/attendance", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== "STUDENT") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    // Placeholder - will be implemented when attendance system is added
    return {
      message: "Attendance feature coming soon",
      attendance: []
    };
  });

  // Root route
  app.get("/", async () => {
    return { message: "Jesa World SMS API is running!" };
  });

  try {
    const port = process.env.PORT || 4000;
    await app.listen({ port: Number(port), host: "0.0.0.0" });
    app.log.info(`🚀 Server listening on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();