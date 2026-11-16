import { NextResponse } from 'next/server';
import { isHash, type Hash } from 'viem';
import { getWeekKey } from '@/lib/game-rules';
import { prisma } from '@/lib/prisma';
import { toSnapshot } from '@/lib/server/player';
import { isPaidPlay } from '@/lib/server/plays';
import { findSessionPlayer } from '@/lib/server/session';
import { weekStandings } from '@/lib/server/tournament';

/**
 * Saves a finished round to this week's leaderboard. The player pays for it with one XurriPlays
 * `startGame()` transaction from their own wallet; each transaction saves exactly one round.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { roundId?: string; txHash?: string };
  const player = await findSessionPlayer();
  if (!player?.address) return NextResponse.json({ error: 'Sign in to save your score' }, { status: 401 });
  if (!body.roundId || !body.txHash || !isHash(body.txHash)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const round = await prisma.gameRound.findUnique({ where: { id: body.roundId } });
  if (!round || round.playerId !== player.id || !round.finishedAt) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (round.ranked) return NextResponse.json({ error: 'This score is already saved' }, { status: 409 });
  if (!round.score || round.flagged) return NextResponse.json({ error: 'This score can’t be saved' }, { status: 400 });

  const weekKey = getWeekKey(round.finishedAt);
  if (weekKey !== getWeekKey()) return NextResponse.json({ error: 'That week’s board has closed' }, { status: 400 });

  const txHash = body.txHash.toLowerCase();
  if (await prisma.gameRound.findUnique({ where: { txHash } })) return NextResponse.json({ error: 'That payment was already used' }, { status: 409 });
  if (!(await isPaidPlay(txHash as Hash, player.address))) {
    return NextResponse.json({ error: 'We couldn’t find your payment on Celo. Please try again.' }, { status: 400 });
  }

  // Only one request can turn the round ranked, so a double tap can't spend two payments on it.
  const saved = await prisma.gameRound.updateMany({ where: { id: round.id, ranked: false }, data: { ranked: true, txHash, weekKey } });
  if (saved.count === 0) return NextResponse.json({ error: 'This score is already saved' }, { status: 409 });

  const weeklyBest = player.weekKey === weekKey ? player.weeklyBest : 0;
  const updated = await prisma.player.update({
    where: { id: player.id },
    data: { weekKey, weeklyBest: Math.max(weeklyBest, round.score) },
  });
  const rank = (await weekStandings(weekKey)).find((row) => row.playerId === player.id)?.rank ?? null;

  return NextResponse.json({ rank, player: toSnapshot(updated) });
}
