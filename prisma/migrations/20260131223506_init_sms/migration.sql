/*
  Warnings:

  - You are about to drop the `Swap` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `login` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `register` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `review_count` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'TEACHER', 'STUDENT');

-- DropForeignKey
ALTER TABLE "public"."Swap" DROP CONSTRAINT "Swap_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."login" DROP CONSTRAINT "login_user_id_fkey";

-- DropTable
DROP TABLE "public"."Swap";

-- DropTable
DROP TABLE "public"."login";

-- DropTable
DROP TABLE "public"."register";

-- DropTable
DROP TABLE "public"."review_count";

-- DropEnum
DROP TYPE "public"."SwapStatus";

-- CreateTable
CREATE TABLE "public"."schools" (
    "id" TEXT NOT NULL,
    "school_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "max_students" INTEGER NOT NULL DEFAULT 100,
    "max_teachers" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'STUDENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "school_id" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_school_number_key" ON "public"."schools"("school_number");

-- CreateIndex
CREATE UNIQUE INDEX "schools_email_key" ON "public"."schools"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
