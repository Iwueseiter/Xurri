import { NextResponse } from 'next/server';
import { isHash } from 'viem';
import { prisma } from '@/lib/prisma';
import { ubiClaimDay } from '@/lib/server/daily';
import { findSessionPlayer, setAccountProof, snapshotFor } from '@/lib/server/session';

/** Records today's GoodDollar claim (checked on Celo) and moves the player's daily streak along. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { txHash?: string };
  if (!body.txHash || !isHash(body.txHash)) return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 });

  const player = await findSessionPlayer();
  if (!player?.address) return NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401 });

  const day = await ubiClaimDay(body.txHash, player.address);
  if (day === null) return NextResponse.json({ error: 'We couldn’t find that claim on Celo yet' }, { status: 400 });

  let updated = player;
  if (day > player.claimDay) {
    const claimStreak = player.claimDay === day - 1 ? player.claimStreak + 1 : 1;
    updated = await prisma.player.update({ where: { id: player.id }, data: { claimDay: day, claimStreak } });
  }

  // The claim was sent by the wallet itself: that proves the account is theirs.
  await setAccountProof(player.id);
  return NextResponse.json(await snapshotFor(updated));
}
