/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Swap" DROP CONSTRAINT "Swap_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."login" DROP CONSTRAINT "login_user_id_fkey";

-- DropTable
DROP TABLE "public"."User";

-- CreateTable
CREATE TABLE "public"."register" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "date_of_birth" TEXT,
    "country" TEXT,
    "state" TEXT,
    "address" TEXT,
    "facebook" TEXT,
    "twitter" TEXT,
    "linkedin" TEXT,
    "instagram" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "register_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "register_user_id_key" ON "public"."register"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "register_username_key" ON "public"."register"("username");

-- CreateIndex
CREATE UNIQUE INDEX "register_email_key" ON "public"."register"("email");

-- AddForeignKey
ALTER TABLE "public"."login" ADD CONSTRAINT "login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."register"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Swap" ADD CONSTRAINT "Swap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."register"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
