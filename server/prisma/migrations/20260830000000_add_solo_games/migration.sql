-- CreateTable
CREATE TABLE "SoloGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoloGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoloGame_userId_idx" ON "SoloGame"("userId");
CREATE INDEX "SoloGame_createdAt_idx" ON "SoloGame"("createdAt");

-- AddForeignKey
ALTER TABLE "SoloGame" ADD CONSTRAINT "SoloGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoloGame" ADD CONSTRAINT "SoloGame_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
