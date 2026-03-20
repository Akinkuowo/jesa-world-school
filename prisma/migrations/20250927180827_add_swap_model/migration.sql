-- CreateEnum
CREATE TYPE "public"."SwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."Swap" ADD COLUMN     "status" "public"."SwapStatus" NOT NULL DEFAULT 'PENDING';
