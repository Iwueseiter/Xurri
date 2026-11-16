-- Streak of days in a row the player claimed GoodDollar's daily G$ through Xurri.
ALTER TABLE "Player" ADD COLUMN "claimStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "claimDay" INTEGER NOT NULL DEFAULT -1;
