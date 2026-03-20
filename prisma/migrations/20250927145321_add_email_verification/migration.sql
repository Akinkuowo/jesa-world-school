-- CreateTable
CREATE TABLE "public"."register" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."login" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "login_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "register_user_id_key" ON "public"."register"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "register_username_key" ON "public"."register"("username");

-- CreateIndex
CREATE UNIQUE INDEX "register_email_key" ON "public"."register"("email");

-- CreateIndex
CREATE UNIQUE INDEX "login_user_id_key" ON "public"."login"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "login_email_key" ON "public"."login"("email");

-- AddForeignKey
ALTER TABLE "public"."login" ADD CONSTRAINT "login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."register"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
