-- CreateTable
CREATE TABLE "public"."review_count" (
    "id" TEXT NOT NULL,
    "swap_id" TEXT NOT NULL,
    "num" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_count_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_count_swap_id_key" ON "public"."review_count"("swap_id");
