import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getTodayKey } from '@/lib/game-rules';
import { prisma } from '@/lib/prisma';
import { roundsUsedToday, toSnapshot } from '@/lib/server/player';
import { getSessionPlayer } from '@/lib/server/session';

/**
 * Starts a round. Any signed-in player can play as often as they like, for free. A round only joins
 * the weekly leaderboard if the player saves it afterwards with a CELO transaction (/api/game/save).
 */
export async function POST() {
  const player = await getSessionPlayer();
  if (!player.address && !player.loginEmail) {
    return NextResponse.json({ error: 'Sign in with a wallet or email to play' }, { status: 401 });
  }

  const [round, updated] = await prisma.$transaction([
    prisma.gameRound.create({ data: { playerId: player.id, seed: randomInt(1, 2 ** 31 - 1), ranked: false } }),
    prisma.player.update({ where: { id: player.id }, data: { roundsDay: getTodayKey(), roundsUsed: roundsUsedToday(player) + 1 } }),
  ]);

  return NextResponse.json({ roundId: round.id, seed: round.seed, ranked: false, player: toSnapshot(updated) });
}
