-- AlterTable: optional players (guest battles) + match metadata
ALTER TABLE "Match" ALTER COLUMN "player1Id" DROP NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "player2Id" DROP NOT NULL;
ALTER TABLE "Match" ADD COLUMN "guestName1" TEXT;
ALTER TABLE "Match" ADD COLUMN "guestName2" TEXT;
ALTER TABLE "Match" ADD COLUMN "isDraw" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN "forfeit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MatchAnswer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,
    "selectedIndex" INTEGER,

    CONSTRAINT "MatchAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchAnswer_matchId_idx" ON "MatchAnswer"("matchId");
CREATE INDEX "MatchAnswer_userId_idx" ON "MatchAnswer"("userId");

-- AddForeignKey
ALTER TABLE "MatchAnswer" ADD CONSTRAINT "MatchAnswer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchAnswer" ADD CONSTRAINT "MatchAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
