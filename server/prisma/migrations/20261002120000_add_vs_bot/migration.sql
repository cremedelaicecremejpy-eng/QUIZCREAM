-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "vsBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Match_topicId_vsBot_idx" ON "Match"("topicId", "vsBot");
